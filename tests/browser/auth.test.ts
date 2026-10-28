import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { resetDevTestOutput } from "../helpers/dev-output";
import { testClientIP } from "../helpers/client-ip";

test("Desktop and mobile invitation authentication UI", { timeout: 180000 }, async t => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "TEST_DATABASE_URL is required");
  const target = new URL(url);
  assert.match(target.pathname, /_test$/);
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"),
      [target.hostname, target.port || "5432", target.pathname].join(":"));
  }
  const base = "http://localhost:3198";
  const env = { ...process.env, DATABASE_URL: url, APP_URL: base,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env, stdio: "pipe", timeout: 30000,
  });
  await resetDevTestOutput();
  const db = createPrismaClient(url);
  const adminId = randomUUID();
  const adminEmail = `${adminId}@example.invalid`;
  const password = "browser-test-password-123";
  const memberEmails: string[] = [];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3198"], {
    env, stdio: "ignore",
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(server.exitCode, null, "Test app exited before readiness");
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(500);
    }
    assert.ok(ready, "Test app must be ready");
    await db.user.create({ data: { id: adminId, name: "Browser admin", email: adminEmail, role: "admin",
      accounts: { create: { id: randomUUID(), accountId: adminId, providerId: "credential", password: await hashPassword(password) } },
    } });
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await t.test(`invite, join, login, role restriction, logout at ${viewport.width}px`, async () => {
        const adminContext = await browser!.newContext({ viewport, extraHTTPHeaders: { "X-Forwarded-For": testClientIP() } });
        const memberContext = await browser!.newContext({ viewport, extraHTTPHeaders: { "X-Forwarded-For": testClientIP() } });
        const pageErrors: string[] = [];
        let nativeCredentialNavigation = false;
        try {
          const admin = await adminContext.newPage();
          const member = await memberContext.newPage();
          for (const page of [admin, member]) page.on("pageerror", error => pageErrors.push(error.message));
          admin.on("request", request => {
            if (request.resourceType() === "document" && new URL(request.url()).searchParams.has("password")) nativeCredentialNavigation = true;
          });
          await admin.goto(`${base}/login`);
          await admin.getByLabel("이메일", { exact: true }).fill(adminEmail);
          await admin.getByLabel("비밀번호", { exact: true }).fill(password);
          const signIn = admin.waitForResponse(response => response.url().endsWith("/api/auth/sign-in/email"), { timeout: 10000 }).catch(() => null);
          await admin.getByRole("button", { name: "로그인", exact: true }).click();
          const signedIn = await signIn;
          assert.ok(signedIn, JSON.stringify({ nativeCredentialNavigation, pageErrors: pageErrors.slice(0, 2) }));
          assert.equal(signedIn.status(), 200);
          assert.equal(nativeCredentialNavigation, false);
          await admin.waitForURL(base + "/");
          await admin.getByRole("link", { name: "친구 초대", exact: true }).click();
          const email = `${randomUUID()}@example.invalid`;
          memberEmails.push(email);
          await admin.getByLabel("받는 사람 이메일", { exact: false }).fill(email);
          await admin.getByRole("button", { name: "초대 링크 만들기" }).click();
          const link = admin.getByLabel("초대 링크", { exact: true });
          await link.waitFor();
          const invitationUrl = await link.inputValue();
          assert.ok(invitationUrl.startsWith(base + "/join#token="));
          await member.goto(invitationUrl);
          await member.getByLabel("초대 코드", { exact: false }).waitFor();
          await member.waitForFunction(() => location.hash === "" &&
            (document.querySelector('input[name="token"]') as HTMLInputElement)?.value.length === 64);
          await member.getByLabel("이름", { exact: true }).fill("Browser member");
          await member.getByLabel("이메일", { exact: true }).fill(email);
          await member.getByLabel("비밀번호", { exact: false }).fill(password);
          await member.getByRole("button", { name: "가입하기", exact: true }).click();
          await member.getByRole("status").filter({ hasText: "가입이 완료됐습니다" }).waitFor();
          await member.getByRole("link", { name: "로그인하기" }).click();
          await member.getByLabel("이메일", { exact: true }).fill(email);
          await member.getByLabel("비밀번호", { exact: true }).fill(password);
          await member.getByRole("button", { name: "로그인", exact: true }).click();
          await member.waitForURL(base + "/");
          assert.ok(await member.getByText("Browser member님", { exact: true }).isVisible());
          assert.equal(await member.getByRole("link", { name: "친구 초대", exact: true }).count(), 0);
          assert.equal((await member.request.get(base + "/api/admin/invitations")).status(), 403);
          assert.ok(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          // Every destination remains reachable with the keyboard and marks the current page.
          for (const [label, route, heading] of [
            ["기록", "/history", "운동 기록"], ["루틴", "/routines", "주간 루틴"], ["설정", "/settings", "설정"],
          ]) {
            const link = member.getByRole("navigation", { name: "주 메뉴", exact: true }).getByRole("link", { name: label, exact: true });
            await link.focus();
            await member.keyboard.press("Enter");
            await member.waitForURL(base + route);
            await member.getByRole("heading", { name: heading, exact: true, level: 1 }).waitFor();
            assert.equal(await link.getAttribute("aria-current"), "page");
            assert.equal(await member.locator('nav[aria-label="주 메뉴"] [aria-current="page"]').count(), 1);
            assert.ok(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          }
          assert.ok(await member.getByText(email, { exact: true }).isVisible());
          await member.reload();
          await member.keyboard.press("Tab");
          assert.equal(await member.evaluate(() => document.activeElement?.textContent), "본문으로 이동");
          await member.keyboard.press("Enter");
          assert.equal(await member.evaluate(() => document.activeElement?.id), "main-content");
          await member.getByRole("button", { name: "로그아웃", exact: true }).click();
          await member.waitForURL(base + "/login");
          assert.equal((await member.request.get(base + "/api/me")).status(), 401);
          for (const route of ["/history", "/routines", "/settings"]) {
            await member.goto(base + route);
            await member.waitForURL(base + "/login");
          }
          assert.deepEqual(pageErrors, []);
        } finally { await adminContext.close(); await memberContext.close(); }
      });
    }
  } finally {
    await browser?.close();
    if (server.exitCode === null) { const exited = once(server, "exit"); server.kill("SIGTERM"); await exited; }
    await db.invitation.deleteMany({ where: { createdBy: adminId } });
    await db.user.deleteMany({ where: { OR: [{ id: adminId }, { email: { in: memberEmails } }] } });
    await db.$disconnect();
  }
});
