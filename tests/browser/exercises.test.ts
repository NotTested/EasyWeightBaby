import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { exerciseApp } from "../helpers/exercise-app";

test("Exercise editor on desktop and narrow mobile", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3195);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const user = await app.user();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
    for (const width of [1280, 320]) await t.test(`create, alias search, edit and reactivate at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
      try {
        const page = await context.newPage();
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto(app.base + "/exercises"); await page.waitForURL(app.base + "/login");
        await page.getByLabel("이메일", { exact: true }).fill(user.email);
        await page.getByLabel("비밀번호", { exact: true }).fill(user.password);
        await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(app.base + "/");
        await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "루틴", exact: true }).click();
        await page.getByRole("link", { name: "운동 종목 관리", exact: true }).click();
        await page.getByRole("heading", { name: "운동 종목", level: 1 }).waitFor();
        const name = "테스트 종목 " + randomUUID(); const alias = "별칭 " + randomUUID();
        await page.getByLabel("종목명", { exact: true }).fill(name);
        await page.locator('input[name="aliases"]').fill(alias);
        await page.getByRole("button", { name: "종목 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "종목을 저장했습니다" }).waitFor();
        await page.reload();
        await page.getByLabel("종목명·별칭 검색", { exact: true }).fill(alias);
        await page.getByLabel("종목명·별칭 검색", { exact: true }).press("Enter");
        const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });
        await row.getByRole("button", { name: "편집", exact: true }).click();
        await page.getByLabel("메모", { exact: true }).fill("자세 메모 변경");
        await page.getByLabel("활성 종목", { exact: true }).uncheck();
        await page.getByRole("button", { name: "종목 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "종목을 비활성화했습니다" }).waitFor();
        await page.getByLabel("표시 범위", { exact: true }).selectOption("all");
        await row.getByRole("button", { name: "편집", exact: true }).click();
        assert.equal(await page.getByLabel("메모", { exact: true }).inputValue(), "자세 메모 변경");
        await page.getByLabel("활성 종목", { exact: true }).check();
        await page.getByRole("button", { name: "종목 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "종목을 저장했습니다" }).waitFor();
        assert.equal(await page.getByLabel("공개 범위", { exact: true }).count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await t.test("admin creates a shared exercise; member sees it read-only", async () => {
      const admin = await app.user("admin");
      const adminContext = await browser!.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
      const memberContext = await browser!.newContext({ extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
      try {
        const page = await adminContext.newPage();
        await page.goto(app.base + "/login");
        await page.getByLabel("이메일", { exact: true }).fill(admin.email);
        await page.getByLabel("비밀번호", { exact: true }).fill(admin.password);
        await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(app.base + "/");
        await page.goto(app.base + "/exercises");
        const name = "공용 테스트 " + randomUUID();
        await page.getByLabel("종목명", { exact: true }).fill(name);
        await page.getByLabel("공개 범위", { exact: true }).selectOption("shared");
        const result = page.waitForResponse(response => response.url() === app.base + "/api/exercises" && response.request().method() === "POST");
        await page.getByRole("button", { name: "종목 저장", exact: true }).click();
        const response = await result; assert.equal(response.status(), 201);
        app.sharedIds.push((await response.json()).item.id);
        const member = await memberContext.newPage();
        await member.goto(app.base + "/login");
        await member.getByLabel("이메일", { exact: true }).fill(user.email);
        await member.getByLabel("비밀번호", { exact: true }).fill(user.password);
        await member.getByRole("button", { name: "로그인", exact: true }).click(); await member.waitForURL(app.base + "/");
        await member.goto(app.base + "/exercises");
        await member.getByLabel("종목명·별칭 검색", { exact: true }).fill(name);
        await member.getByLabel("종목명·별칭 검색", { exact: true }).press("Enter");
        const row = member.getByRole("listitem").filter({ has: member.getByRole("heading", { name, exact: true }) });
        await row.getByText("공용", { exact: true }).waitFor();
        assert.equal(await row.getByRole("button", { name: "편집" }).count(), 0);
      } finally { await adminContext.close(); await memberContext.close(); }
    });
  } finally { await browser?.close(); await app.cleanup(); }
});
