import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { exerciseApp } from "../helpers/exercise-app";
test("cardio, notes, failed end and completed editing on PC and narrow mobile", { timeout: 180000 }, async t => {
 const app = await exerciseApp(3188); let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 try {
  const user = await app.user();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
  for (const width of [1280, 320]) await t.test(`end, reload, history and edit at ${width}px`, async () => {
   const context = await browser!.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
   try {
    const created = await app.request("/api/sessions", "POST", { requestId: randomUUID(), title: "유산소 " + randomUUID(), localDate: "2026-10-28", source: null }, user.cookie);
    const item = (await created.json()).item;
    const page = await context.newPage(); await page.goto(app.base + "/login");
    await page.getByLabel("이메일", { exact: true }).fill(user.email); await page.getByLabel("비밀번호", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(app.base + "/");
    await page.goto(`${app.base}/sessions/${item.id}`);
    await page.getByRole("button", { name: "유산소 추가", exact: true }).click();
    await page.getByLabel("유산소 종류", { exact: true }).fill("빠른 걷기");
    await page.getByLabel("운동 시간(분)", { exact: true }).fill("20.5");
    await page.getByLabel("강도·Zone 설명", { exact: true }).fill("Zone 2? 대화 가능");
    await page.getByLabel("유산소 메모", { exact: true }).fill("경사 조금");
    await page.getByLabel("유산소 수행 완료", { exact: true }).check();
    await page.getByLabel("운동일지 메모", { exact: true }).fill("퇴근 후 운동\n무리하지 않음");
    await page.route(`**/api/sessions/${item.id}`, async route => {
     if (route.request().method() === "PATCH") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "종료 저장 실패" }) });
     else await route.continue();
    });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "저장하고 운동 종료", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "종료 저장 실패" }).waitFor();
    assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).inputValue(), "퇴근 후 운동\n무리하지 않음");
    assert.equal(await page.getByLabel("운동 시간(분)", { exact: true }).isEnabled(), true);
    assert.equal((await app.db.workoutSession.findUniqueOrThrow({ where: { id: item.id } })).status, "in_progress");
    await page.unroute(`**/api/sessions/${item.id}`);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "저장하고 운동 종료", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "운동을 종료하고 기록을 저장했습니다" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: "완료 기록 수정", exact: true }).waitFor();
    assert.equal(await page.getByLabel("운동 시간(분)", { exact: true }).inputValue(), "20.5");
    assert.equal(await page.getByLabel("거리(km, 선택)", { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("운동 시간(분)", { exact: true }).isDisabled(), true);
    assert.ok((await page.locator("main").innerText()).includes("종료 시각:"));
    await page.getByRole("link", { name: "운동 기록 목록", exact: true }).click();
    await page.getByRole("link", { name: item.title, exact: true }).click();
    await page.getByRole("button", { name: "완료 기록 수정", exact: true }).click();
    await page.getByLabel("운동일지 메모", { exact: true }).fill("수정한 메모");
    await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "실제 수행 기록을 저장했습니다" }).waitFor();
    await page.reload(); assert.equal(await page.getByLabel("운동일지 메모", { exact: true }).inputValue(), "수정한 메모");
    assert.equal(await page.getByRole("button", { name: "저장하고 운동 종료", exact: true }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
   } finally { await context.close(); }
  });
 } finally { await browser?.close(); await app.cleanup(); }
});
