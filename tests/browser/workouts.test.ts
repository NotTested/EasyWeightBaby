import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { exerciseApp, exerciseFixture } from "../helpers/exercise-app";
import { blankRoutine } from "../../src/lib/routine-input";

test("start and resume empty/planned sessions at desktop/mobile widths", { timeout: 180000 }, async t => {
  const app = await exerciseApp(3191); let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const user = await app.user();
    const ex = await app.request("/api/exercises", "POST", { ...exerciseFixture("Start exercise"), execution: "alternating", scope: "private" }, user.cookie);
    const exerciseId = (await ex.json()).item.id;
    const plan = blankRoutine(); plan.name = "Start plan"; plan.days[0] = { weekday: 0, rest: false, items: [{ exerciseId, sets: 3, minReps: 10, maxReps: 12, rir: null, benchAngle: "", notes: "" }] };
    const routine = await app.request("/api/routines", "POST", plan, user.cookie); const routineId = (await routine.json()).item.id;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true });
    for (const width of [1280, 320]) await t.test(`start, reload and resume at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": app.clientIP } });
      try {
        const page = await context.newPage(); await page.goto(app.base + "/sessions"); await page.waitForURL(app.base + "/login");
        await page.getByLabel("이메일", { exact: true }).fill(user.email); await page.getByLabel("비밀번호", { exact: true }).fill(user.password);
        await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(app.base + "/");
        await page.getByRole("link", { name: "운동 시작·이어서 열기", exact: true }).click();
        const emptyTitle = "빈 운동 " + randomUUID();
        await page.getByLabel("운동 제목", { exact: true }).fill(emptyTitle); await page.getByLabel("실제 운동 날짜", { exact: true }).fill("2026-10-18");
        await page.getByRole("button", { name: "운동 시작", exact: true }).click(); await page.waitForURL(/\/sessions\/[^/]+$/);
        await page.getByRole("heading", { name: emptyTitle, exact: true }).waitFor(); const emptyUrl = page.url();
        await page.reload(); await page.getByRole("heading", { name: emptyTitle, exact: true }).waitFor();
        await page.getByRole("link", { name: "진행 중 목록", exact: true }).click();
        await page.getByRole("link", { name: emptyTitle, exact: true }).click(); await page.waitForURL(emptyUrl);
        await page.getByRole("link", { name: "진행 중 목록", exact: true }).click();
        const title = "계획 운동 " + randomUUID(); await page.getByLabel("운동 제목", { exact: true }).fill(title);
        await page.getByLabel("시작할 계획", { exact: true }).selectOption(routineId);
        await page.getByLabel("계획 요일", { exact: true }).selectOption("1");
        await page.getByRole("status").filter({ hasText: "휴식일입니다" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "운동 시작", exact: true }).isDisabled(), true);
        await page.getByLabel("계획 요일", { exact: true }).selectOption("0");
        await page.getByRole("button", { name: "운동 시작", exact: true }).click(); await page.waitForURL(/\/sessions\/[^/]+$/);
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        await page.getByRole("heading", { name: "Start exercise", exact: true }).waitFor();
        assert.ok((await page.locator("main").innerText()).includes("목표 3세트"));
        assert.ok((await page.locator("main").innerText()).includes("실제 수행 기록이 아닙니다"));
        const actual = page.getByRole("region", { name: "Start exercise 실제 기록", exact: true });
        await actual.getByRole("button", { name: "세트 추가", exact: true }).click();
        await actual.getByLabel("개당 중량(kg)", { exact: true }).fill("12.5");
        await actual.getByLabel("덤벨 수", { exact: true }).fill("2");
        await actual.getByLabel("반복수", { exact: true }).fill("10");
        await actual.getByLabel("수행 완료", { exact: true }).check();
        await actual.getByLabel("수행 측", { exact: true }).selectOption("left");
        await actual.getByLabel("마지막 본세트 RIR", { exact: true }).fill("0");
        await actual.getByRole("button", { name: "세트 추가", exact: true }).click();
        assert.equal(await actual.getByLabel("마지막 본세트 RIR", { exact: true }).inputValue(), "0"); // unfinished row is excluded
        await actual.getByLabel("수행 측", { exact: true }).nth(1).selectOption("right");
        await actual.getByLabel("개당 중량(kg)", { exact: true }).nth(1).fill("12.5");
        await actual.getByLabel("덤벨 수", { exact: true }).nth(1).fill("1");
        await actual.getByLabel("반복수", { exact: true }).nth(1).fill("8");
        await actual.getByLabel("수행 완료", { exact: true }).nth(1).check();
        assert.equal(await actual.getByLabel("마지막 본세트 RIR", { exact: true }).inputValue(), "");
        assert.equal(await actual.getByLabel("실제 RIR", { exact: true }).first().inputValue(), "0");
        await actual.getByLabel("마지막 본세트 RIR", { exact: true }).fill("2");
        await actual.getByRole("button", { name: "세트 추가", exact: true }).click();
        await actual.getByLabel("세트 구분", { exact: true }).nth(2).selectOption("warmup");
        await actual.getByLabel("개당 중량(kg)", { exact: true }).nth(2).fill("5");
        await actual.getByLabel("덤벨 수", { exact: true }).nth(2).fill("1");
        await actual.getByLabel("반복수", { exact: true }).nth(2).fill("5");
        await actual.getByLabel("수행 완료", { exact: true }).nth(2).check();
        assert.equal(await actual.getByLabel("마지막 본세트 RIR", { exact: true }).inputValue(), "2");
        await page.getByRole("button", { name: "수행 기록 저장", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "실제 수행 기록을 저장했습니다" }).waitFor();
        await page.reload();
        assert.equal(await actual.getByLabel("개당 중량(kg)", { exact: true }).first().inputValue(), "12.5");
        assert.equal(await actual.getByLabel("반복수", { exact: true }).nth(1).inputValue(), "8");
        assert.equal(await actual.getByLabel("수행 완료", { exact: true }).first().isChecked(), true);
        assert.equal(await actual.getByLabel("수행 완료", { exact: true }).nth(1).isChecked(), true);
        assert.equal(await actual.getByLabel("수행 측", { exact: true }).first().inputValue(), "left");
        assert.equal(await actual.getByLabel("수행 측", { exact: true }).nth(1).inputValue(), "right");
        assert.equal(await actual.getByLabel("실제 RIR", { exact: true }).first().inputValue(), "0");
        assert.equal(await actual.getByLabel("마지막 본세트 RIR", { exact: true }).inputValue(), "2");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      } finally { await context.close(); }
    });
  } finally { await browser?.close(); await app.cleanup(); }
});
