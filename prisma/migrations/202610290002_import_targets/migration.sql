CREATE UNIQUE INDEX "ImportSource_id_ownerId_key" ON "ImportSource"("id", "ownerId");
CREATE TABLE "ImportTarget" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sourceId" TEXT NOT NULL,
 "ownerId" TEXT NOT NULL,
 "targetKind" TEXT NOT NULL CHECK ("targetKind" IN ('exercise','routine_item','session','log')),
 "targetId" TEXT NOT NULL CHECK (length("targetId") > 0),
 "mappingHash" TEXT NOT NULL CHECK ("mappingHash" ~ '^[0-9a-f]{64}$'),
 "snapshotHash" TEXT NOT NULL CHECK ("snapshotHash" ~ '^[0-9a-f]{64}$'),
 "state" TEXT NOT NULL DEFAULT 'prepared' CHECK ("state" = 'prepared'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ImportTarget_sourceId_ownerId_fkey" FOREIGN KEY ("sourceId", "ownerId") REFERENCES "ImportSource"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ImportTarget_sourceId_key" ON "ImportTarget"("sourceId");
CREATE INDEX "ImportTarget_ownerId_targetKind_targetId_idx" ON "ImportTarget"("ownerId", "targetKind", "targetId");
