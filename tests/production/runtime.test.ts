import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { cp, mkdtemp, readdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../../src/lib/prisma-client";

test("Relocated standalone production runtime", { timeout: 120000 }, async t => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "TEST_DATABASE_URL is required");
  const target = new URL(url);
  assert.match(target.pathname, /_test$/);
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"),
      [target.hostname, target.port || "5432", target.pathname].join(":"));
  }
  const base = "http://localhost:3199";
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: url, APP_URL: base,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1",
    PORT: "3199", HOSTNAME: "127.0.0.1" };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env, stdio: "pipe", timeout: 30000,
  });
  const dir = await mkdtemp(path.join(tmpdir(), "member-production-"));
  const db = createPrismaClient(url);
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  const password = "production-test-password-123";
  let server: ReturnType<typeof spawn> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await cp(path.resolve(".next/standalone"), dir, { recursive: true });
    await access(path.join(dir, "server.js"));
    assert.equal((await readdir(dir)).some(name => name === ".env" || name.startsWith(".env.")), false);
    server = spawn(process.execPath, [path.join(dir, "server.js")], { cwd: dir, env, stdio: "ignore" });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      assert.equal(server.exitCode, null, "Production server exited before readiness");
      try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(500);
    }
    assert.ok(ready, "Production server must become ready");
    await t.test("DB health, security headers and anonymous access", async () => {
      const response = await fetch(base + "/api/health");
      assert.deepEqual(await response.json(), { status: "ok" });
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-powered-by"), null);
      assert.equal((await fetch(base + "/api/me")).status, 401);
      const home = await fetch(base + "/", { redirect: "manual" });
      assert.equal(home.status, 307);
      assert.equal(home.headers.get("location"), "/login");
    });
    await db.user.create({ data: { id, email, name: "Production member", accounts: {
      create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) },
    } } });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
    await t.test("production JS/CSS hydration, login and logout", async () => {
      const page = await browser!.newPage({ viewport: { width: 390, height: 844 } });
      const errors: string[] = [];
      const staticFailures: string[] = [];
      let staticResponses = 0;
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        if (response.url().includes("/_next/static/")) {
          staticResponses++;
          if (!response.ok()) staticFailures.push(String(response.status()));
        }
      });
      await page.goto(base + "/login");
      await page.getByLabel("이메일", { exact: true }).fill(email);
      await page.getByLabel("비밀번호", { exact: true }).fill(password);
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL(base + "/");
      assert.ok(await page.getByText("Production member님", { exact: true }).isVisible());
      assert.equal((await page.request.get(base + "/api/me")).status(), 200);
      assert.equal((await page.request.get(base + "/api/admin/invitations")).status(), 403);
      await page.goto(base + "/settings");
      // Exercise app UI for a dismissed prompt separately from the real CDP installation suite.
      await page.getByText("브라우저와 설치한 앱에서", { exact: false }).waitFor();
      await page.evaluate(`(() => {
        window.pwaPromptCalled = false;
        window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
          prompt: async () => { window.pwaPromptCalled = true; },
          userChoice: Promise.resolve({ outcome: "dismissed" }),
        }));
      })()`);
      assert.equal(await page.evaluate(() => (window as typeof window & { pwaPromptCalled?: boolean }).pwaPromptCalled), false);
      await page.getByRole("button", { name: "앱 설치하기", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "설치를 취소했습니다" }).waitFor();
      assert.equal(await page.evaluate(() => (window as typeof window & { pwaPromptCalled?: boolean }).pwaPromptCalled), true);
      await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
      await page.getByRole("status").filter({ hasText: "기기의 앱 목록에서 열어주세요" }).waitFor();
      await page.getByRole("button", { name: "로그아웃", exact: true }).click();
      await page.waitForURL(base + "/login");
      assert.equal((await page.request.get(base + "/api/me")).status(), 401);
      assert.ok(staticResponses > 0);
      assert.deepEqual(staticFailures, []);
      assert.deepEqual(errors, []);
      await page.close();
    });
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
});
