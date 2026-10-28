-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "routineName" TEXT,
ADD COLUMN     "routineNumber" INTEGER,
ADD COLUMN     "routineVersionId" TEXT,
ADD COLUMN     "routineWeekday" INTEGER,
ADD COLUMN     "startHash" TEXT,
ADD COLUMN     "startKey" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionExercise" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "execution" TEXT NOT NULL,
    "measurement" TEXT NOT NULL,
    "goalSets" INTEGER NOT NULL,
    "goalMinReps" INTEGER NOT NULL,
    "goalMaxReps" INTEGER NOT NULL,
    "goalRir" INTEGER,
    "benchAngle" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "SessionExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionExercise_sessionId_position_key" ON "SessionExercise"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_ownerId_startKey_key" ON "WorkoutSession"("ownerId", "startKey");

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_routineVersionId_fkey" FOREIGN KEY ("routineVersionId") REFERENCES "RoutineVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

