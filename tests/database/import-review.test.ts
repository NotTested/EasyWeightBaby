import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createPrismaClient } from "../../src/lib/prisma-client";
import { dryRunReview, reviewTemplate, validateReview, reviewHash } from "../../src/lib/import-review";
import { importFixture } from "../helpers/import-fixture";
test("review ledger dry-run rollback, idempotence, conflicts and owner FK", { timeout: 60000 }, async () => {
 const url = process.env.TEST_DATABASE_URL; assert.ok(url); assert.match(new URL(url).pathname, /_test$/);
 const dev = process.env.DATABASE_URL; assert.ok(dev);
 const aUrl = new URL(url), bUrl = new URL(dev);
 assert.notEqual([aUrl.hostname, aUrl.port || "5432", aUrl.pathname].join(":"), [bUrl.hostname, bUrl.port || "5432", bUrl.pathname].join(":"));
 execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
 const db = createPrismaClient(url), owner = randomUUID(), other = randomUUID();
 const staging = importFixture(), template = reviewTemplate(staging);
 const manifest = { ...template, decisions: template.decisions.map(d => ({ ...d, decision: "reviewed" })) };
 const review = validateReview(staging, manifest), entry = review.reviewed[0];
 try {
  await db.user.createMany({ data: [owner, other].map(id => ({ id, name: "Review fixture", email: `${id}@example.invalid` })) });
  const result = await dryRunReview(db, owner, staging, manifest);
  assert.equal(result.newSources, 1); assert.equal(result.canApply, false);
  assert.equal(await db.importBatch.count({ where: { ownerId: owner } }), 0);
  assert.equal(await db.importSource.count({ where: { ownerId: owner } }), 0);
  assert.equal(await db.workoutSession.count({ where: { ownerId: owner } }), 0);
  assert.equal(await db.exercise.count({ where: { ownerId: owner } }), 0);
  const batch = await db.importBatch.create({ data: { ownerId: owner, archiveHash: template.archiveHash, stagingHash: template.stagingHash, manifestHash: review.manifestHash } });
  await db.importSource.create({ data: { ownerId: owner, sourceType: entry.sourceType, externalId: entry.externalId!, contentHash: entry.contentHash, reviewHash: reviewHash(entry), review: entry, batchId: batch.id } });
  assert.equal((await dryRunReview(db, owner, staging, manifest)).reusedSources, 1);
  assert.equal((await dryRunReview(db, other, staging, manifest)).newSources, 1);
  assert.equal(await db.importSource.count({ where: { ownerId: other } }), 0);
  await assert.rejects(db.importSource.create({ data: { ownerId: other, sourceType: entry.sourceType, externalId: entry.externalId!, contentHash: entry.contentHash, reviewHash: reviewHash(entry), review: entry, batchId: batch.id } }), { code: "P2003" });
  await db.importSource.updateMany({ where: { ownerId: owner }, data: { contentHash: "f".repeat(64) } });
  await assert.rejects(dryRunReview(db, owner, staging, manifest), /refusing overwrite/);
  assert.equal(await db.importBatch.count({ where: { ownerId: owner } }), 1);
  assert.equal(await db.importSource.count({ where: { ownerId: owner } }), 1);
  const development = createPrismaClient(dev);
  try { await assert.rejects(dryRunReview(development, owner, staging, manifest), /_test database/); } finally { await development.$disconnect(); }
 } finally { await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.$disconnect(); }
});
