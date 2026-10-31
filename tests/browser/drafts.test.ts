import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, type BrowserContext } from "playwright-core";
import { exerciseApp } from "../helpers/exercise-app";
import { draftKey, encodeDraft, startRequestKey } from "../../src/lib/workout-draft";
test("draft recovery, offline, conflicts, storage failure and account cleanup", { timeout: 240000 }, async t => {
 const app = await exerciseApp(3186); let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 try {
  const a = await app.user(), b = await app.user();
  async function session(cookie = a.cookie) { return (await (await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "Draft " + randomUUID(), localDate: "2026-10-28", source: null }, cookie)).json()).item; }
  async function cookies(context: BrowserContext, cookie = a.cookie) { await context.addCookies(cookie.split("; ").map(pair => { const split = pair.indexOf("="); return { name: pair.slice(0, split), value: pair.slice(split + 1), url: app.base }; })); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
  for (const width of [1280, 320]) await t.test(`recover, leave, offline and save at ${width}px`, async () => {
   const context = await browser!.newContext({ viewport: { width, height: 900 } });
   try {
    await cookies(context); const item = await session(), key = draftKey(a.id, item.id);
    const page = await context.newPage(); await page.goto(`${app.base}/sessions/${item.id}`);
    await page.getByLabel("운동일지 메모", { exact: true }).fill("복구할 메모");
    await page.getByRole("button", { name: "유산소 추가", exact: true }).click(); // unfinished input must survive
    await page.getByRole("status").filter({ hasText: "이 기기에 초안을 보관했습니다" }).waitFor();
    page.once("dialog", d => d.accept()); await page.reload();
    await page.getByRole("button", { name: "기기 초안 복구", exact: true }).waitFor();
    assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "기기 초안 복구", exact: true }).click();
    assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).inputValue(), "복구할 메모");
    assert.equal(await page.getByLabel("유산소 종류", { exact: true }).inputValue(), "");
    page.once("dialog", d => d.dismiss()); await page.getByRole("link", { name: "운동 기록 목록", exact: true }).click(); assert.ok(page.url().endsWith(item.id));
    page.once("dialog", d => d.accept()); await page.getByRole("link", { name: "운동 기록 목록", exact: true }).click(); await page.waitForURL(app.base + "/history");
    await page.getByRole("link", { name: item.title, exact: true }).click(); await page.getByRole("button", { name: "기기 초안 복구", exact: true }).click();
    await page.getByLabel("유산소 종류", { exact: true }).fill("걷기");
    await context.setOffline(true);
    await page.getByLabel("운동일지 메모", { exact: true }).fill("오프라인 수정");
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "오프라인입니다" }).waitFor();
    assert.equal((await app.db.workoutSession.findUniqueOrThrow({ where: { id: item.id } })).version, 1);
    await context.setOffline(false);
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "실제 수행 기록을 저장했습니다" }).waitFor();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
    assert.equal((await app.db.workoutSession.findUniqueOrThrow({ where: { id: item.id } })).actualNotes, "오프라인 수정");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
   } finally { await context.close(); }
  });
  await t.test("start response loss keeps one request across reload", async () => {
   const context = await browser!.newContext();
   try {
    await cookies(context); const page = await context.newPage(); await page.goto(app.base + "/sessions");
    const title = "시작 응답 유실 " + randomUUID();
    await page.getByLabel("운동 제목", { exact: true }).fill(title);
    await page.route("**/api/sessions", async route => {
     if (route.request().method() !== "POST") { await route.continue(); return; }
     const response = await route.fetch(); assert.equal(response.status(), 201);
     await route.abort("failed"); // server committed; browser did not receive the response
    });
    await page.getByRole("button", { name: "운동 시작", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "시작 상태를 확인하지 못했습니다" }).waitFor();
    const pendingKey = startRequestKey(a.id);
    assert.ok(await page.evaluate(k => localStorage.getItem(k), pendingKey));
    await page.unroute("**/api/sessions"); await page.reload();
    await page.getByRole("button", { name: "동일 시작 요청 다시 확인", exact: true }).click(); await page.waitForURL(/\/sessions\/[^/]+$/);
    assert.equal(await app.db.workoutSession.count({ where: { ownerId: a.id, title } }), 1);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), pendingKey), null);
   } finally { await context.close(); }
  });
  await t.test("stale draft, expired login, other tabs and logout cleanup", async () => {
   const context = await browser!.newContext();
   try {
    await cookies(context); const item = await session(), key = draftKey(a.id, item.id);
    const page = await context.newPage(); await page.goto(`${app.base}/sessions/${item.id}`);
    await page.getByLabel("운동일지 메모", { exact: true }).fill("오래된 초안");
    await page.getByRole("status").filter({ hasText: "이 기기에 초안을 보관했습니다" }).waitFor();
    const changed = await app.request(`/api/sessions/${item.id}`, "PATCH", { version: 1, exercises: [], actualNotes: "서버 최신" }, a.cookie); assert.equal(changed.status, 200);
    page.once("dialog", d => d.accept()); await page.reload(); await page.getByRole("button", { name: "기기 초안 복구", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "수행 기록 저장", exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).inputValue(), "오래된 초안");
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "서버 기록 다시 불러오기", exact: true }).click();
    await page.waitForFunction(() => (document.querySelector("#workout-notes") as HTMLTextAreaElement)?.value === "서버 최신");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
    await page.getByLabel("운동일지 메모", { exact: true }).fill("세션 만료 초안");
    await page.route(`**/api/sessions/${item.id}`, r => r.fulfill({ status: 401, contentType: "application/json", body: '{}' }));
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "로그인이 만료됐습니다" }).waitFor();
    assert.ok(await page.evaluate(k => localStorage.getItem(k), key)); await page.unroute(`**/api/sessions/${item.id}`);
    const second = await context.newPage(); await second.goto(`${app.base}/sessions/${item.id}`);
    await second.getByRole("button", { name: "기기 초안 복구", exact: true }).click();
    await second.getByLabel("운동일지 메모", { exact: true }).fill("다른 탭 수정");
    await second.getByRole("status").filter({ hasText: "이 기기에 초안을 보관했습니다" }).waitFor();
    await page.getByLabel("운동일지 메모", { exact: true }).fill("이 탭 별도 입력");
    await page.getByRole("status").filter({ hasText: "다른 탭이 초안을 변경했습니다" }).waitFor();
    const foreignKey = draftKey(b.id, "foreign");
    await page.evaluate(([k, value]) => localStorage.setItem(k, value), [foreignKey, encodeDraft(b.id, { ...item, id: "foreign", actualNotes: "다른 계정" })]);
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "로그아웃", exact: true }).click(); await page.waitForURL(app.base + "/login");
    await second.getByRole("alert").filter({ hasText: "로그아웃했습니다" }).waitFor();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
    assert.ok(await page.evaluate(k => localStorage.getItem(k), foreignKey));
   } finally { await context.close(); }
  });
  await t.test("storage write failure never claims successful draft backup", async () => {
   const context = await browser!.newContext();
   try {
    const fresh = await app.user(); await cookies(context, fresh.cookie); const item = await session(fresh.cookie);
    await context.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith("member-workout-draft:")) throw new DOMException("quota", "QuotaExceededError"); return original.call(this, k, v); }; });
    const page = await context.newPage(); await page.goto(`${app.base}/sessions/${item.id}`); await page.getByLabel("운동일지 메모", { exact: true }).fill("보관 실패");
    await page.getByRole("status").filter({ hasText: "기기 초안을 보관하지 못했습니다" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "입력 텍스트 내려받기", exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), draftKey(fresh.id, item.id)), null);
   } finally { await context.close(); }
  });
 } finally { await browser?.close(); await app.cleanup(); }
});
