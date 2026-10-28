import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createPrismaClient } from "../../src/lib/prisma-client";

test("PostgreSQL migration and Prisma adapter", { timeout: 60000 }, async t => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL is required; this check must not silently skip");
  const target = new URL(databaseUrl);
  assert.match(target.pathname, /_test$/);
  const dev = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
  assert.ok(!dev || [target.hostname, target.port || "5432", target.pathname].join(":") !==
    [dev.hostname, dev.port || "5432", dev.pathname].join(":"), "Test and development DB must differ");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe", timeout: 30000,
  });
  const db = createPrismaClient(databaseUrl);
  const id = randomUUID();
  const rollbackId = randomUUID();
  const schema = `smoke_${randomUUID().replaceAll("-", "")}`;
  try {
    await t.test("connects to the intended test database", async () => {
      const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      assert.equal(row.name, decodeURIComponent(target.pathname.slice(1)));
    });
    await t.test("creates, reads, updates and deletes a related workout", async () => {
      await db.user.create({ data: { id, email: `${id}@example.invalid`, name: "DB smoke" } });
      const workout = await db.workoutSession.create({ data: {
        ownerId: id, title: "Database verification", localDate: "2026-10-28",
      } });
      const saved = await db.workoutSession.findUniqueOrThrow({ where: { id: workout.id } });
      assert.equal(saved.ownerId, id);
      assert.equal(saved.timeZone, "Asia/Seoul");
      const updated = await db.workoutSession.update({ where: { id: workout.id }, data: {
        status: "completed", version: { increment: 1 },
      } });
      assert.equal(updated.version, 2);
      assert.equal(updated.status, "completed");
      await db.workoutSession.delete({ where: { id: workout.id } });
      assert.equal(await db.workoutSession.findUnique({ where: { id: workout.id } }), null);
    });
    await t.test("rolls back failed transactions", async () => {
      const abort = new Error("intentional rollback");
      await assert.rejects(db.$transaction(async tx => {
        await tx.user.create({ data: { id: rollbackId, email: `${rollbackId}@example.invalid`, name: "Rollback" } });
        throw abort;
      }), error => error === abort);
      assert.equal(await db.user.findUnique({ where: { id: rollbackId } }), null);
    });
    await t.test("enforces workout owner foreign keys", async () => {
      await assert.rejects(db.workoutSession.create({ data: {
        ownerId: randomUUID(), title: "Invalid owner", localDate: "2026-10-28",
      } }), { code: "P2003" });
    });
    await t.test("honors a non-public schema URL option", async () => {
      // Generated identifier only; no external input is interpolated into SQL.
      await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."User" (LIKE "public"."User" INCLUDING ALL)`);
      const url = new URL(databaseUrl);
      url.searchParams.set("schema", schema);
      const other = createPrismaClient(url.toString());
      try {
        assert.equal(await other.user.count(), 0);
        await other.user.create({ data: { id, email: `${id}@example.invalid`, name: "Other schema" } });
        assert.equal((await other.user.findUniqueOrThrow({ where: { id } })).name, "Other schema");
        assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).name, "DB smoke");
      } finally { await other.$disconnect(); }
    });
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.user.deleteMany({ where: { id: { in: [id, rollbackId] } } });
    await db.$disconnect();
  }
});
