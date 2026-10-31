ALTER TABLE "WorkoutSession" ADD COLUMN "endedAt" TIMESTAMP(3), ADD COLUMN "actualNotes" TEXT NOT NULL DEFAULT '';
CREATE TABLE "CardioRecord" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sessionId" TEXT NOT NULL REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 "activity" TEXT NOT NULL,
 "durationMinutes" DOUBLE PRECISION CHECK ("durationMinutes" >= 0 AND "durationMinutes" <= 1440),
 "distanceKm" DOUBLE PRECISION CHECK ("distanceKm" >= 0 AND "distanceKm" <= 1000),
 "intensity" TEXT NOT NULL,
 "notes" TEXT NOT NULL,
 "completed" BOOLEAN NOT NULL DEFAULT false,
 CHECK (NOT "completed" OR "durationMinutes" IS NOT NULL)
);
CREATE UNIQUE INDEX "CardioRecord_sessionId_position_key" ON "CardioRecord"("sessionId", "position");
