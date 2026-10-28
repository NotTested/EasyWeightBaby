import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { chromium } from "playwright-core";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../../src/lib/prisma-client";

test("Chromium PWA install and standalone launch", { timeout: 120000 }, async t => {
  assert.ok(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL is required");
  assert.match(new URL(process.env.TEST_DATABASE_URL).pathname, /_test$/);
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL), target = new URL(process.env.TEST_DATABASE_URL);
    assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"),
      [target.hostname, target.port || "5432", target.pathname].join(":"));
  }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: "pipe", timeout: 30000,
  });
  const db = createPrismaClient(process.env.TEST_DATABASE_URL);
  const id = randomUUID(), email = `${id}@example.invalid`, password = "pwa-test-password-123";
  const cert = process.env.PWA_HTTPS_CERT_FILE;
  const key = process.env.PWA_HTTPS_KEY_FILE;
  assert.equal(!!cert, !!key, "Set both HTTPS certificate and key");
  const base = `${cert ? "https" : "http"}://localhost:3210`;
  const profile = await mkdtemp(path.join(tmpdir(), "member-pwa-"));
  const server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, APP_URL: base,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), PORT: "3211", HOSTNAME: "127.0.0.1" },
    stdio: "ignore",
  });
  let proxy: http.Server | undefined;
  let replacementWorker: string | undefined;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
      const handler: http.RequestListener = (request, response) => {
        // Serve a genuine next worker version without rebuilding or altering project files.
        if (request.url === "/sw.js" && replacementWorker) {
          response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
          response.end(replacementWorker); return;
        }
        const upstream = http.request({ host: "127.0.0.1", port: 3211, method: request.method, path: request.url,
          headers: { ...request.headers, "x-forwarded-proto": cert ? "https" : "http" } }, result => {
          response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
        });
        upstream.on("error", () => { response.writeHead(502); response.end(); });
        request.pipe(upstream);
      };
      proxy = cert && key ? https.createServer({ cert: await readFile(cert), key: await readFile(key) }, handler) : http.createServer(handler);
      proxy.listen(3210, "127.0.0.1"); await once(proxy, "listening");
    context = await chromium.launchPersistentContext(path.join(profile, "profile"), {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: process.env.PWA_HEADFUL !== "1",
      env: { ...process.env, XDG_DATA_HOME: path.join(profile, "data"), XDG_CONFIG_HOME: path.join(profile, "config") },
    });
    const page = context.pages()[0];
    let ready = false;
    for (let i = 0; i < 60; i++) {
      assert.equal(server.exitCode, null, "Standalone server exited");
      try { if ((await context.request.get(base + "/api/health")).ok()) { ready = true; break; } } catch { /* startup */ }
      await delay(500);
    }
    assert.ok(ready, "HTTPS/HTTP readiness failed; TLS errors must not be ignored");
    await db.user.create({ data: { id, email, name: "PWA member", accounts: {
      create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) },
    } } });
    await page.goto(base + "/login");
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(base + "/");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cdp = await context.newCDPSession(page);
    await t.test("manifest, icons and browser installability", async () => {
      assert.equal(await page.evaluate(() => isSecureContext), true);
      const manifest = await cdp.send("Page.getAppManifest");
      assert.deepEqual(manifest.errors, []);
      const data = JSON.parse(manifest.data!);
      assert.equal(data.id, "/"); assert.equal(data.scope, "/");
      assert.equal(data.start_url, "/"); assert.equal(data.display, "standalone");
      assert.ok(data.icons.some((icon: { purpose: string }) => icon.purpose === "maskable"));
      for (const icon of data.icons) {
        const image = await context!.request.get(base + icon.src);
        assert.equal(image.status(), 200);
        assert.match(image.headers()["content-type"], /image\/png/);
      }
      const result = await cdp.send("Page.getInstallabilityErrors");
      assert.deepEqual(result.installabilityErrors, []);
      const worker = await context!.request.get(base + "/sw.js");
      assert.match(worker.headers()["cache-control"], /no-store/);
    });
    await t.test("offline banner, public fallback and no private cache", async () => {
      assert.equal(await page.evaluate(() => fetch("/api/me").then(response => response.status)), 200);
      const entries = await page.evaluate(`(async () => {
        const result = [];
        for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) result.push(new URL(request.url).pathname);
        return result;
      })()`);
      assert.deepEqual(entries, ["/offline.html"]);
      await context!.setOffline(true);
      await page.getByRole("status").filter({ hasText: "연결이 끊겼습니다" }).waitFor();
      assert.equal(await page.evaluate("fetch('/api/me').then(() => 'unexpected-response').catch(() => 'network-failed')"), "network-failed");
      await context!.setOffline(false);
      await page.getByRole("status").filter({ hasText: "연결이 복구됐습니다" }).waitFor();
      await context!.setOffline(true);
      await page.goto(base + "/settings");
      await page.getByRole("heading", { name: "연결을 확인해주세요." }).waitFor();
      assert.equal((await page.locator("body").innerText()).includes(email), false);
      await context!.setOffline(false);
      await page.getByRole("link", { name: "다시 연결하기" }).click();
      await page.waitForURL(base + "/");
      await page.getByText("PWA member님", { exact: true }).waitFor();
    });
    await t.test("waiting updates preserve input in both tabs until confirmed", async () => {
      await page.goto(base + "/login");
      await page.getByLabel("이메일", { exact: true }).fill("unsaved@example.invalid");
      await page.evaluate("window.b3Marker = 'original-page'");
      const other = await context!.newPage();
      await other.goto(base + "/login");
      await other.getByLabel("이메일", { exact: true }).fill("other-unsaved@example.invalid");
      await other.evaluate("window.b3Marker = 'other-original-page'");
      const editor = await context!.newPage();
      await editor.goto(base + "/exercises");
      const draftName = "Update protection " + randomUUID();
      await editor.getByLabel("종목명", { exact: true }).fill(draftName);
      const version = "test-update-" + randomUUID();
      replacementWorker = (await readFile("scripts/sw-template.js", "utf8")).replace("__MEMBER_BUILD_ID__", JSON.stringify(version));
      await page.evaluate("navigator.serviceWorker.getRegistration().then(reg => reg.update())");
      const apply = page.getByRole("button", { name: "업데이트 적용", exact: true });
      await apply.waitFor();
      assert.equal(await page.evaluate("window.b3Marker"), "original-page");
      await apply.click();
      await page.getByRole("status").filter({ hasText: "입력 중인 내용이 있습니다" }).waitFor();
      assert.equal(await page.evaluate("navigator.serviceWorker.getRegistration().then(reg => !!reg.waiting)"), true);
      assert.equal(await page.getByLabel("이메일", { exact: true }).inputValue(), "unsaved@example.invalid");
      await page.getByLabel("이메일", { exact: true }).fill("");
      await Promise.all([page.waitForEvent("load"), apply.click()]);
      assert.equal(await page.evaluate("window.b3Marker"), undefined);
      await other.getByRole("status").filter({ hasText: "새 버전이 준비됐습니다" }).waitFor();
      assert.equal(await other.evaluate("window.b3Marker"), "other-original-page");
      await other.getByRole("button", { name: "업데이트 적용" }).click();
      await other.getByRole("status").filter({ hasText: "입력 중인 내용이 있습니다" }).waitFor();
      await other.getByLabel("이메일", { exact: true }).fill("");
      await Promise.all([other.waitForEvent("load"), other.getByRole("button", { name: "업데이트 적용" }).click()]);
      await other.close();
      await editor.getByRole("button", { name: "업데이트 적용" }).click();
      await editor.getByRole("status").filter({ hasText: "입력 중인 내용이 있습니다" }).waitFor();
      assert.equal(await editor.getByLabel("종목명", { exact: true }).inputValue(), draftName);
      await editor.getByRole("button", { name: "종목 저장", exact: true }).click();
      await editor.getByRole("status").filter({ hasText: "종목을 저장했습니다" }).waitFor();
      await editor.waitForFunction(() => !!document.querySelector('form[data-update-safe="true"]'));
      await Promise.all([editor.waitForEvent("load"), editor.getByRole("button", { name: "업데이트 적용" }).click()]);
      await editor.getByRole("heading", { name: draftName, exact: true }).waitFor();
      await editor.close();
      const keys = await page.evaluate(() => caches.keys());
      assert.deepEqual(keys, ["member-offline-" + version]);
    });
    await t.test("actual Chromium install, launch, deep link and relaunch", async () => {
      await cdp.send("PWA.install", { manifestId: base + "/", installUrlOrBundleUrl: base + "/login" });
      try {
        // CDP installation uses a browser preference separately from manifest display.
        // This is the user's "open in app window" preference, not media emulation.
        await cdp.send("PWA.changeAppUserSettings", { manifestId: base + "/", displayMode: "standalone" });
        const opening = context!.waitForEvent("page", { predicate: candidate => candidate !== page });
        const launched = await cdp.send("PWA.launch", { manifestId: base + "/", url: base + "/settings" });
        assert.ok(launched.targetId);
        const app = await opening;
        await app.waitForURL(base + "/settings");
        await app.waitForFunction(() => matchMedia("(display-mode: standalone)").matches);
        await app.getByRole("status").filter({ hasText: "설치된 앱으로 사용 중" }).waitFor();
        assert.ok(await app.getByText(email, { exact: true }).isVisible());
        await app.close();
        const reopening = context!.waitForEvent("page", { predicate: candidate => candidate !== page });
        await cdp.send("PWA.launch", { manifestId: base + "/" });
        const reopened = await reopening;
        await reopened.waitForURL(base + "/");
        await reopened.waitForFunction(() => matchMedia("(display-mode: standalone)").matches);
        assert.ok(await reopened.getByText("PWA member님", { exact: true }).isVisible());
        await reopened.close();
      } finally { await cdp.send("PWA.uninstall", { manifestId: base + "/" }); }
      assert.equal((await context!.request.get(base + "/api/me")).status(), 200);
    });
  } finally {
    await context?.close();
    if (proxy) { proxy.closeAllConnections(); await new Promise<void>((resolve, reject) => proxy!.close(error => error ? reject(error) : resolve())); }
    if (server.exitCode === null) { const exit = once(server, "exit"); server.kill("SIGTERM"); await exit; }
    await db.exercise.deleteMany({ where: { ownerId: id } });
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
    await rm(profile, { recursive: true, force: true });
  }
});
