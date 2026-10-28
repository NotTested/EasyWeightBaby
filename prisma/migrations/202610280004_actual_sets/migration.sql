ALTER TABLE "SessionExercise" ALTER COLUMN "goalSets" DROP NOT NULL, ALTER COLUMN "goalMinReps" DROP NOT NULL, ALTER COLUMN "goalMaxReps" DROP NOT NULL;
CREATE TABLE "WorkoutSet" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sessionExerciseId" TEXT NOT NULL REFERENCES "SessionExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "position" INTEGER NOT NULL CHECK ("position" >= 0),
 "weightKg" DOUBLE PRECISION CHECK ("weightKg" >= 0 AND "weightKg" <= 2000),
 "dumbbellCount" INTEGER CHECK ("dumbbellCount" IN (1,2)),
 "reps" INTEGER CHECK ("reps" >= 0 AND "reps" <= 1000),
 "completed" BOOLEAN NOT NULL DEFAULT false,
 CHECK (NOT "completed" OR ("weightKg" IS NOT NULL AND "reps" IS NOT NULL))
);
CREATE UNIQUE INDEX "WorkoutSet_sessionExerciseId_position_key" ON "WorkoutSet"("sessionExerciseId", "position");
