import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { prepareTargetLink } from "../../src/lib/import-target-link";
import { exerciseFixture } from "../helpers/exercise-app";
test("prepared target links enforce account/kind, reuse and reject edits/deletion/repointing", { timeout: 60000 }, async () => {
 const url = process.env.TEST_DATABASE_URL; assert.ok(url); assert.match(new URL(url).pathname, /_test$/);
 const dev = new URL(process.env.DATABASE_URL!); const dbUrl = new URL(url);
 assert.notEqual([dev.hostname, dev.port || "5432", dev.pathname].join(":"), [dbUrl.hostname, dbUrl.port || "5432", dbUrl.pathname].join(":"));
 execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
 const db = createPrismaClient(url), ownerId = randomUUID(), adminId = randomUUID(), hash = "a".repeat(64);
 try {
  await db.user.createMany({ data: [{ id: ownerId, name: "Owner", email: `${ownerId}@example.invalid` }, { id: adminId, role: "admin", name: "Admin", email: `${adminId}@example.invalid` }] });
  const batch = await db.importBatch.create({ data: { ownerId, archiveHash: hash, stagingHash: hash, manifestHash: hash } });
  const source = await db.importSource.create({ data: { ownerId, sourceType: "exercises", externalId: "b".repeat(32), contentHash: hash, reviewHash: hash, review: {}, batchId: batch.id } });
  const exercise = await db.exercise.create({ data: { ...exerciseFixture("Prepared target"), ownerId, scopeKey: `user:${ownerId}`, nameKey: "prepared target", searchText: "prepared target" } });
  const input = { sourceId: source.id, targetKind: "exercise", targetId: exercise.id, mappingHash: hash };
  const first = await db.$transaction(tx => prepareTargetLink(tx, ownerId, input));
  assert.equal(first.reused, false); assert.equal(first.state, "prepared");
  assert.equal((await db.$transaction(tx => prepareTargetLink(tx, ownerId, input))).reused, true);
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, adminId, input)), /Source not found/);
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, { ...input, ownerId: adminId })));
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, { ...input, mappingHash: "c".repeat(64) })), /Mapping changed/);
  const foreign = await db.exercise.create({ data: { ...exerciseFixture("Foreign target"), ownerId: adminId, scopeKey: `user:${adminId}`, nameKey: "foreign target", searchText: "foreign target" } });
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, { ...input, targetId: foreign.id })), /Target not found/);
  const unlinked = await db.importSource.create({ data: { ownerId, sourceType: "exercises", externalId: "c".repeat(32), contentHash: hash, reviewHash: hash, review: {}, batchId: batch.id } });
  await assert.rejects(db.importTarget.create({ data: { ...input, sourceId: unlinked.id, ownerId: adminId, snapshotHash: hash } }), { code: "P2003" });
  await db.exercise.update({ where: { id: exercise.id }, data: { notes: "edited by owner", version: { increment: 1 } } });
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, input)), /Application target changed/);
  assert.equal((await db.exercise.findUniqueOrThrow({ where: { id: exercise.id } })).notes, "edited by owner");
  await db.exercise.delete({ where: { id: exercise.id } });
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, input)), /do not recreate/);
  assert.equal(await db.importTarget.count({ where: { ownerId } }), 1); // retain evidence of the deleted target
  const session = await db.workoutSession.create({ data: { ownerId, title: "Session link", localDate: "2026-10-29" } });
  const sessionSource = await db.importSource.create({ data: { ownerId, sourceType: "sessions", externalId: "d".repeat(32), contentHash: hash, reviewHash: hash, review: {}, batchId: batch.id } });
  await db.$transaction(tx => prepareTargetLink(tx, ownerId, { sourceId: sessionSource.id, targetKind: "session", targetId: session.id, mappingHash: hash }));
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, { ...input, sourceId: sessionSource.id })), /kinds differ/);
  const owned = await db.exercise.create({ data: { ...exerciseFixture("Owned link"), ownerId, scopeKey: `user:${ownerId}`, nameKey: "owned link", searchText: "owned link" } });
  const routine = await db.routine.create({ data: { ownerId, name: "Linked routine", versions: { create: { number: 1, name: "Linked routine", days: { create: { weekday: 0, rest: false, items: { create: { position: 0, exerciseId: owned.id, exerciseName: owned.name, equipment: owned.equipment, sets: 3, minReps: 10, maxReps: 12, benchAngle: "", notes: "" } } } } } } }, include: { versions: { include: { days: { include: { items: true } } } } } });
  const itemId = routine.versions[0].days[0].items[0].id;
  const routineSource = await db.importSource.create({ data: { ownerId, sourceType: "routines", externalId: "e".repeat(32), contentHash: hash, reviewHash: hash, review: {}, batchId: batch.id } });
  const routineInput = { sourceId: routineSource.id, targetKind: "routine_item", targetId: itemId, mappingHash: hash };
  await db.$transaction(tx => prepareTargetLink(tx, ownerId, routineInput));
  const log = await db.sessionExercise.create({ data: { sessionId: session.id, exerciseId: owned.id, position: 0, exerciseName: owned.name, equipment: owned.equipment, execution: owned.execution, measurement: owned.measurement, benchAngle: "", notes: "", sets: { create: { position: 0, weightKg: 1, dumbbellCount: 2, reps: 10, completed: true } } }, include: { sets: true } });
  const logSource = await db.importSource.create({ data: { ownerId, sourceType: "logs", externalId: "f".repeat(32), contentHash: hash, reviewHash: hash, review: {}, batchId: batch.id } });
  const logInput = { sourceId: logSource.id, targetKind: "log", targetId: log.id, mappingHash: hash };
  await db.$transaction(tx => prepareTargetLink(tx, ownerId, logInput));
  await db.workoutSet.update({ where: { id: log.sets[0].id }, data: { reps: 11 } });
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, logInput)), /Application target changed/);
  await assert.rejects(db.$transaction(tx => prepareTargetLink(tx, ownerId, { sourceId: sessionSource.id, targetKind: "session", targetId: session.id, mappingHash: hash })), /Application target changed/);

 } finally {
  await db.workoutSession.deleteMany({ where: { ownerId: { in: [ownerId, adminId] } } });
  await db.routine.deleteMany({ where: { ownerId: { in: [ownerId, adminId] } } });
  await db.exercise.deleteMany({ where: { ownerId: { in: [ownerId, adminId] } } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } }); await db.$disconnect();
 }
});
