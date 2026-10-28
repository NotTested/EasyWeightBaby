import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { resetDevTestOutput } from "./dev-output";
import { testClientIP } from "./client-ip";

export async function exerciseApp(port: number) {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url); const target = new URL(url); assert.match(target.pathname, /_test$/);
  if (process.env.DATABASE_URL) {
    const dev = new URL(process.env.DATABASE_URL);
    assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"),
      [target.hostname, target.port || "5432", target.pathname].join(":"));
  }
  const base = `http://localhost:${port}`;
  const env = { ...process.env, DATABASE_URL: url, APP_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" };
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "pipe", timeout: 30000 });
  await resetDevTestOutput();
  const db = createPrismaClient(url);
  const userIds: string[] = [], sharedIds: string[] = [];
  const password = "exercise-test-password-123";
  const clientIP = testClientIP();
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: "ignore" });
  async function cleanup() {
    if (server.exitCode === null) { const exit = once(server, "exit"); server.kill("SIGTERM"); await exit; }
    await db.workoutSession.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.routine.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.exercise.deleteMany({ where: { OR: [{ ownerId: { in: userIds } }, { id: { in: sharedIds } }] } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(server.exitCode, null);
      try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(500);
    }
    assert.ok(ready, "Test app did not start");
  } catch (error) { await cleanup(); throw error; }
  async function request(path: string, method = "GET", body?: unknown, cookie?: string, origin = base) {
    return fetch(base + path, { method, headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function user(role = "member") {
    const id = randomUUID(), email = `${id}@example.invalid`;
    await db.user.create({ data: { id, email, name: "Exercise member", role, accounts: {
      create: { id: randomUUID(), providerId: "credential", accountId: id, password: await hashPassword(password) },
    } } });
    userIds.push(id);
    const result = await fetch(base + "/api/auth/sign-in/email", { method: "POST", headers: {
      Origin: base, "Content-Type": "application/json", "X-Forwarded-For": clientIP,
    }, body: JSON.stringify({ email, password }) });
    assert.equal(result.status, 200);
    const cookie = result.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.ok(cookie);
    return { id, email, password, cookie };
  }
  return { db, base, request, user, sharedIds, cleanup, clientIP };
}

export const exerciseFixture = (name: string) => ({ name, aliases: ["RDL"], equipment: "dumbbell", category: "legs",
  execution: "bilateral", measurement: "reps", benchAngle: "", notes: "fixture", active: true });
