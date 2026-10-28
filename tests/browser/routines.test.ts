import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";

test("weekly routine editor and history at desktop/mobile widths", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3193);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const user = await app.user(); const ids: string[] = [];
    for (const label of ["First", "Second"]) {
      const response = await app.request("/api/exercises", "POST", { ...exerciseFixture(label + randomUUID()), scope: "private" }, user.cookie);
      assert.equal(response.status, 201); ids.push((await response.json()).item.id);
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
    for (const width of [1280, 320]) await t.test(`create, reorder, version and reopen at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
      try {
        const page = await context.newPage();
        await page.goto(app.base + "/routines"); await page.waitForURL(app.base + "/login");
        await page.getByLabel("이메일", { exact: true }).fill(user.email); await page.getByLabel("비밀번호", { exact: true }).fill(user.password);
        await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(app.base + "/");
        await page.goto(app.base + "/routines");
        const name = "주간 " + randomUUID();
        await page.getByLabel("루틴 이름", { exact: true }).fill(name);
        const monday = page.getByRole("group", { name: "월요일", exact: true });
        await monday.getByLabel("휴식일", { exact: true }).uncheck();
        for (let index = 0; index < 2; index++) {
          await monday.getByRole("button", { name: "종목 추가", exact: true }).click();
          await monday.getByLabel("운동 종목", { exact: true }).nth(index).selectOption(ids[index]);
        }
        await monday.getByRole("button", { name: "월 1번 아래로", exact: true }).click();
        await page.getByRole("button", { name: "루틴 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "버전 1을 저장했습니다" }).waitFor();
        await monday.getByLabel("목표 세트", { exact: true }).first().fill("4");
        await page.getByLabel("루틴 이름", { exact: true }).fill(name + " 수정");
        await page.getByRole("button", { name: "새 버전 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "버전 2을 저장했습니다" }).waitFor();
        await page.getByLabel("저장 버전", { exact: true }).selectOption("1");
        await page.getByRole("status").filter({ hasText: "이전 버전은 읽기 전용" }).waitFor();
        assert.equal(await page.getByLabel("루틴 이름", { exact: true }).inputValue(), name);
        assert.equal(await monday.getByLabel("목표 세트", { exact: true }).first().inputValue(), "3");
        assert.equal(await monday.getByLabel("운동 종목", { exact: true }).first().inputValue(), ids[1]);
        assert.equal(await page.getByRole("button", { name: "새 버전 저장", exact: true }).isDisabled(), true);
        await page.getByRole("button", { name: "최신 버전 열기", exact: true }).click();
        await page.getByRole("heading", { name: "루틴 버전 2", exact: true }).waitFor();
        assert.equal(await monday.getByLabel("목표 세트", { exact: true }).first().inputValue(), "4");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.reload();
        await page.getByRole("button", { name: name + " 수정 · v2", exact: true }).click();
        await page.getByRole("heading", { name: "루틴 버전 2", exact: true }).waitFor();
      } finally { await context.close(); }
    });
  } finally { await browser?.close(); await app.cleanup(); }
});
