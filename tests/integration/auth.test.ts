import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { resetDevTestOutput } from "../helpers/dev-output";
import { testClientIP } from "../helpers/client-ip";
import { setTimeout as delay } from "node:timers/promises";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { hashPassword } from "better-auth/crypto";

// 별도 테스트 DB에서만 실행. 시작한 앱에도 동일 URL을 전달합니다.
const databaseUrl = process.env.TEST_DATABASE_URL;
test("초대·인증·소유권 HTTP 통합 검증", { timeout: 180000 }, async t => {
  assert.ok(databaseUrl, "TEST_DATABASE_URL is required; missing configuration must not silently skip");
  assert.match(new URL(databaseUrl).pathname, /_test$/);
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    const target = new URL(databaseUrl);
    assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"),
      [target.hostname, target.port || "5432", target.pathname].join(":"), "Test DB must differ from development DB");
  }
  const base = "http://localhost:3197";
  const clientIP = testClientIP();
  const env = { ...process.env, DATABASE_URL: databaseUrl, APP_URL: base,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "pipe", timeout: 60000 });
  await resetDevTestOutput();
  const db = createPrismaClient(databaseUrl);
  const prefix = `test-${randomUUID()}`;
  const password = "test-password-at-least-12";
  const passwordHash = await hashPassword(password);
  const users: string[] = [];
  const createdEmails = new Set<string>();
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3197"], { env, stdio: "ignore" });
  async function request(path: string, method = "GET", body?: unknown, cookie?: string, origin = base) {
    return fetch(`${base}${path}`, { method, headers: { Origin: origin, "X-Forwarded-For": clientIP, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function makeUser(suffix: string, role = "member") {
    const id = randomUUID(); const email = `${prefix}-${suffix}@example.com`;
    await db.user.create({ data: { id, name: suffix, email, role,
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: passwordHash } } } });
    users.push(id); createdEmails.add(email); return { id, email };
  }
  async function login(email: string) {
    const res = await request("/api/auth/sign-in/email", "POST", { email, password });
    assert.equal(res.status, 200);
    const cookie = res.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    assert.ok(cookie); return cookie;
  }
  async function invite(admin: string, email?: string) {
    const res = await request("/api/admin/invitations", "POST", { ...(email ? { email } : {}), days: 7 }, admin);
    assert.equal(res.status, 201); return await res.json() as { id: string; token: string };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error("Test app exited before startup");
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(500);
    }
    assert.ok(ready, "테스트 앱 시작 실패");
    const admin = await makeUser("admin", "admin");
    const a = await makeUser("a"); const b = await makeUser("b");
    const adminCookie = await login(admin.email); const aCookie = await login(a.email); const bCookie = await login(b.email);
    await t.test("미인증·일반 회원의 관리자 API 접근을 차단", async () => {
      assert.equal((await request("/api/me")).status, 401);
      assert.equal((await request("/api/admin/invitations")).status, 401);
      assert.equal((await request("/api/admin/invitations", "POST", { days: 7 }, aCookie)).status, 403);
      assert.equal((await request("/api/admin/invitations", "POST", { days: 7 }, adminCookie, "https://untrusted.invalid")).status, 403);
    });
    await t.test("본인 기록만 조회하고 관리자도 타인 기록에 접근할 수 없음", async () => {
      const workout = await db.workoutSession.create({ data: { ownerId: a.id, title: "RDL", localDate: "2026-10-23" } });
      assert.equal((await request(`/api/sessions/${workout.id}`, "GET", undefined, aCookie)).status, 200);
      for (const cookie of [bCookie, adminCookie]) {
        assert.equal((await request(`/api/sessions/${workout.id}`, "GET", undefined, cookie)).status, 404);
        const list = await (await request("/api/sessions", "GET", undefined, cookie)).json();
        assert.equal(list.items.some((item: { id: string }) => item.id === workout.id), false);
      }
    });
    await t.test("일반 가입 경로 차단, 잘못된 초대·만료·취소·이메일 불일치 거부", async () => {
      const email = `${prefix}-join@example.com`; createdEmails.add(email);
      assert.notEqual((await request("/api/auth/sign-up/email", "POST", { email, name: "test", password })).status, 200);
      const input = { name: "test", email, password, token: "a".repeat(64) };
      assert.equal((await request("/api/register", "POST", input)).status, 400);
      const wrong = await invite(adminCookie, `${prefix}-other@example.com`);
      assert.equal((await request("/api/register", "POST", { ...input, token: wrong.token })).status, 400);
      const expired = await invite(adminCookie);
      await db.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
      assert.equal((await request("/api/register", "POST", { ...input, token: expired.token })).status, 400);
      const revoked = await invite(adminCookie);
      assert.equal((await request(`/api/admin/invitations/${revoked.id}`, "DELETE", undefined, adminCookie)).status, 200);
      assert.equal((await request("/api/register", "POST", { ...input, token: revoked.token })).status, 400);
    });
    await t.test("동시 초대 가입 중 하나만 성공하고 기본 역할은 member", async () => {
      const email = `${prefix}-concurrent@example.com`; createdEmails.add(email);
      const invitation = await invite(adminCookie, email);
      const stored = await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      assert.equal(stored.tokenHash, createHash("sha256").update(invitation.token).digest("hex"));
      const input = { name: "new member", email, password, token: invitation.token };
      const results = await Promise.all([request("/api/register", "POST", input), request("/api/register", "POST", input)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
      assert.equal((await db.user.findUniqueOrThrow({ where: { email } })).role, "member");
      const cookie = await login(email);
      assert.equal((await request("/api/me", "GET", undefined, cookie)).status, 200);
      assert.equal((await request("/api/auth/sign-out", "POST", {}, cookie)).status, 200);
      assert.equal((await request("/api/me", "GET", undefined, cookie)).status, 401);
    });
    await t.test("중복 계정 가입 실패 시 초대 사용 상태도 롤백", async () => {
      const invitation = await invite(adminCookie, a.email);
      assert.equal((await request("/api/register", "POST", { name: "duplicate", email: a.email, password, token: invitation.token })).status, 400);
      assert.equal((await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).usedAt, null);
    });
  } finally {
    if (server.exitCode === null) { const exit = once(server, "exit"); server.kill("SIGTERM"); await exit; }
    await db.invitation.deleteMany({ where: { createdBy: { in: users } } });
    await db.user.deleteMany({ where: { email: { in: [...createdEmails] } } });
    await db.$disconnect();
  }
});
