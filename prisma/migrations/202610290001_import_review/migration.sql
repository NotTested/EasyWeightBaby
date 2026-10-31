ALTER TABLE "WorkoutSession" ADD COLUMN "recordKind" TEXT NOT NULL DEFAULT 'actual', ADD CONSTRAINT "WorkoutSession_recordKind_check" CHECK ("recordKind" IN ('actual','test','plan'));
CREATE INDEX "WorkoutSession_ownerId_recordKind_localDate_idx" ON "WorkoutSession"("ownerId", "recordKind", "localDate");
CREATE TABLE "ImportBatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "archiveHash" TEXT NOT NULL CHECK ("archiveHash" ~ '^[0-9a-f]{64}$'),
 "stagingHash" TEXT NOT NULL CHECK ("stagingHash" ~ '^[0-9a-f]{64}$'),
 "manifestHash" TEXT NOT NULL CHECK ("manifestHash" ~ '^[0-9a-f]{64}$'),
 "state" TEXT NOT NULL DEFAULT 'reviewed' CHECK ("state" = 'reviewed'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ImportBatch_id_ownerId_key" ON "ImportBatch"("id", "ownerId");
CREATE UNIQUE INDEX "ImportBatch_ownerId_stagingHash_manifestHash_key" ON "ImportBatch"("ownerId", "stagingHash", "manifestHash");
CREATE TABLE "ImportSource" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "provider" TEXT NOT NULL DEFAULT 'notion' CHECK ("provider" = 'notion'),
 "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('exercises','exercise_clones','routines','sessions','logs')),
 "externalId" TEXT NOT NULL CHECK ("externalId" ~ '^[0-9a-f]{32}$'),
 "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
 "reviewHash" TEXT NOT NULL CHECK ("reviewHash" ~ '^[0-9a-f]{64}$'),
 "review" JSONB NOT NULL,
 "batchId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ImportSource_batchId_ownerId_fkey" FOREIGN KEY ("batchId", "ownerId") REFERENCES "ImportBatch"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ImportSource_ownerId_provider_sourceType_externalId_key" ON "ImportSource"("ownerId", "provider", "sourceType", "externalId");
