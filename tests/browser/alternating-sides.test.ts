import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
test("alternating-both selection saves per-side reps and renders comparison on desktop and mobile", { timeout: 180000 }, async t => {
 const app = await exerciseApp(3181); let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 try {
  const user = await app.user();
  const exResponse = await app.request("/api/exercises", "POST", { ...exerciseFixture("교대 검증 " + randomUUID()), execution: "alternating", scope: "private" }, user.cookie);
  assert.equal(exResponse.status, 201); const ex = (await exResponse.json()).item;
  async function start(date: string) { const res = await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "합성 교대 검증", localDate: date, source: null }, user.cookie); assert.equal(res.status, 201); return (await res.json()).item; }
  const previous = await start("2026-10-29");
  const prior = await app.request(`/api/sessions/${previous.id}`, "PATCH", { version: previous.version, intent: "complete", exercises: [{ exerciseId: ex.id, sets: [{ side: "alternating_both", kind: "working", weightKg: 10, dumbbellCount: 2, reps: 12, completed: true, actualRir: null }] }] }, user.cookie);
  assert.equal(prior.status, 200);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
  await mkdir("reports", { recursive: true });
  for (const width of [1280,320]) await t.test(`${width}px`, async () => {
   const current = await start("2026-10-31");
   const context = await browser!.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
   try {
    await context.addCookies(user.cookie.split("; ").map(pair => { const i = pair.indexOf("="); return { name: pair.slice(0,i), value: pair.slice(i+1), url: app.base }; }));
    const page = await context.newPage(); await page.goto(`${app.base}/sessions/${current.id}`);
    await page.getByLabel("추가할 종목 검색", { exact: true }).fill(ex.name); await page.getByRole("button", { name: "종목 검색", exact: true }).click();
    await page.getByRole("button", { name: `종목 추가: ${ex.name}`, exact: true }).click();
    const region = page.getByRole("region", { name: `${ex.name} 실제 기록`, exact: true });
    await region.getByRole("button", { name: "세트 추가", exact: true }).click();
    await region.getByLabel("수행 측", { exact: true }).selectOption({ label: "양쪽 교대" });
    await region.getByLabel("개당 중량(kg)", { exact: true }).fill("10"); await region.getByLabel("덤벨 수", { exact: true }).fill("2");
    await region.getByLabel("한쪽당 반복수", { exact: true }).fill("12"); await region.getByLabel("수행 완료", { exact: true }).check();
    await region.getByLabel("실제 RIR", { exact: true }).fill("0");
    assert.ok((await region.innerText()).includes("좌우 각각 12회 (총 24회)"));
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click(); await page.getByRole("status").filter({ hasText: "실제 수행 기록을 저장했습니다" }).waitFor();
    await page.reload(); assert.equal(await region.getByLabel("한쪽당 반복수", { exact: true }).inputValue(), "12");
    assert.equal(await region.getByLabel("수행 측", { exact: true }).inputValue(), "alternating_both");
    assert.equal(await region.getByLabel("실제 RIR", { exact: true }).inputValue(), "0");
    const comparison = page.getByRole("region", { name: "이전 실제 수행 비교", exact: true });
    await comparison.getByRole("button", { name: "이전 수행 조회·새로고침", exact: true }).click();
    await comparison.getByRole("link", { name: "2026-10-29 · 합성 교대 검증", exact: true }).waitFor();
    assert.ok((await comparison.innerText()).includes("좌우 각각 12회 (총 24회)"));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `reports/alternating-${width}.png`, fullPage: true });
   } finally { await context.close(); }
  });
 } finally { await browser?.close(); await app.cleanup(); }
});
