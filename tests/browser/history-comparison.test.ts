import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { historyFixture } from "../helpers/history-fixture";
test("date filters, paging and prior performance at desktop/mobile widths", { timeout: 180000 }, async t => {
 const app = await exerciseApp(3183); let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 try {
  const a = await app.user(), b = await app.user("admin");
  const ex = (await (await app.request("/api/exercises", "POST", { ...exerciseFixture("Comparison fixture"), scope: "shared" }, b.cookie)).json()).item; app.sharedIds.push(ex.id);
  const { current } = await historyFixture(app.db, a.id, b.id, ex.id);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
  for (const width of [1280, 320]) await t.test(`filters, comparison and draft preservation at ${width}px`, async () => {
   const context = await browser!.newContext({ viewport: { width, height: 900 } });
   try {
    await context.addCookies(a.cookie.split("; ").map(pair => { const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), url: app.base }; }));
    const page = await context.newPage(); await page.goto(app.base + "/history");
    await page.getByRole("link", { name: "다음 20개", exact: true }).click(); await page.waitForURL(/after=/);
    await page.getByRole("link", { name: "첫 페이지", exact: true }).click();
    await page.getByLabel("시작일", { exact: true }).fill("2026-10-19"); await page.getByLabel("종료일", { exact: true }).fill("2026-10-20");
    await page.getByLabel("진행 상태", { exact: true }).selectOption("completed"); await page.getByRole("button", { name: "기록 조회", exact: true }).click();
    await page.waitForURL(/from=2026-10-19/); assert.equal(await page.locator(".session-list li").count(), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${app.base}/sessions/${current.id}`);
    const draftNote = `비교 중 초안 유지 ${width}`;
    await page.getByLabel("운동일지 메모", { exact: true }).fill(draftNote);
    const comparison = page.getByRole("region", { name: "이전 실제 수행 비교", exact: true });
    await comparison.getByRole("button", { name: "이전 수행 조회·새로고침", exact: true }).click();
    await comparison.getByRole("link", { name: "2026-10-20 · History 20", exact: true }).waitFor();
    assert.ok((await comparison.innerText()).includes("마지막 완료 본세트 RIR: 미입력"));
    assert.ok((await comparison.innerText()).includes("마지막 완료 본세트 RIR: 0"));
    assert.ok((await comparison.innerText()).includes("직접적인 수치 비교에 주의"));
    assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).inputValue(), draftNote);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click(); await page.getByRole("status").filter({ hasText: "실제 수행 기록을 저장했습니다" }).waitFor();
   } finally { await context.close(); }
  });
 } finally { await browser?.close(); await app.cleanup(); }
});
