import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { targetFixture } from "../helpers/target-fixture";
import { dryRunTargets } from "../../src/lib/import-target";
test("target writer creates a linked graph and always rolls back, including late conflicts", { timeout: 60000 }, async () => {
 const url = process.env.TEST_DATABASE_URL; assert.ok(url); assert.match(new URL(url).pathname, /_test$/);
 const dev = process.env.DATABASE_URL; assert.ok(dev); const u = new URL(url), d = new URL(dev);
 assert.notEqual([u.hostname, u.port || "5432", u.pathname].join(":"), [d.hostname, d.port || "5432", d.pathname].join(":"));
 execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
 const db = createPrismaClient(url), ownerId = randomUUID(), otherId = randomUUID();
 const fixture = targetFixture();
 try {
  await db.user.createMany({ data: [ownerId, otherId].map(id => ({ id, name: "Target fixture", email: `${id}@example.invalid` })) });
  const result = await dryRunTargets(db, ownerId, fixture.staging, fixture.manifest, fixture.plan);
  assert.deepEqual(result.counts, { exercises: 1, mergedSources: 1, routines: 1, sessions: 3, logs: 2, sets: 3, cardio: 1 });
  assert.equal(result.volumeKg, 225); assert.equal(result.canApply, false);
  assert.deepEqual(result.recordKinds.sort(), ["actual", "plan", "test"]);
  assert.deepEqual(result.sampleSets.find(s => s.side === "right"), { side: "right", reps: 8, actualRir: 0 });
  async function empty() {
   assert.equal(await db.workoutSession.count({ where: { ownerId } }), 0);
   assert.equal(await db.exercise.count({ where: { ownerId } }), 0);
   assert.equal(await db.routine.count({ where: { ownerId } }), 0);
   assert.equal(await db.importBatch.count({ where: { ownerId } }), 0);
   assert.equal(await db.importSource.count({ where: { ownerId } }), 0);
  }
  await empty();
  const tmp = mkdtempSync(join(tmpdir(), "notion-target-test-"));
  try {
   const stagingPath = join(tmp, "staging.json"), manifestPath = join(tmp, "review.json"), planPath = join(tmp, "target.json");
   writeFileSync(stagingPath, fixture.staging); writeFileSync(manifestPath, JSON.stringify(fixture.manifest)); writeFileSync(planPath, JSON.stringify(fixture.plan));
   const output = execFileSync(process.execPath, ["--import", "tsx", "scripts/notion-target.ts", "dry-run", stagingPath, manifestPath, planPath, ownerId], { encoding: "utf8", timeout: 30000 });
   const cli = JSON.parse(output); assert.equal(cli.canApply, false); assert.equal(cli.volumeKg, 225); assert.equal(cli.counts.sessions, 3); assert.equal(cli.sampleSets, undefined);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  await empty();
  assert.deepEqual((await dryRunTargets(db, ownerId, fixture.staging, fixture.manifest, fixture.plan)).counts, result.counts);
  await empty();
  const fields = fixture.plan.exercises.find(e => e.action === "create")!;
  if (fields.action !== "create") throw new Error("fixture");
  // A different owner's matching name is not reused or modified.
  await db.exercise.create({ data: { ...fields.fields, ownerId: otherId, scopeKey: `user:${otherId}`, nameKey: "synthetic unilateral", searchText: "synthetic unilateral" } });
  assert.equal((await dryRunTargets(db, ownerId, fixture.staging, fixture.manifest, fixture.plan)).counts.exercises, 1);
  assert.equal(await db.exercise.count({ where: { ownerId: otherId } }), 1); await empty();
  // Same-owner collision occurs after batch/source creation; all provisional ledger rows must roll back.
  await db.exercise.create({ data: { ...fields.fields, ownerId, scopeKey: `user:${ownerId}`, nameKey: "synthetic unilateral", searchText: "synthetic unilateral" } });
  await assert.rejects(dryRunTargets(db, ownerId, fixture.staging, fixture.manifest, fixture.plan), { code: "P2002" });
  assert.equal(await db.importBatch.count({ where: { ownerId } }), 0);
  assert.equal(await db.importSource.count({ where: { ownerId } }), 0);
  assert.equal(await db.workoutSession.count({ where: { ownerId } }), 0);
  const development = createPrismaClient(dev);
  try { await assert.rejects(dryRunTargets(development, ownerId, fixture.staging, fixture.manifest, fixture.plan), /_test database/); } finally { await development.$disconnect(); }
 } finally {
  await db.workoutSession.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
  await db.routine.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
  await db.exercise.deleteMany({ where: { ownerId: { in: [ownerId, otherId] } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } }); await db.$disconnect();
 }
});
