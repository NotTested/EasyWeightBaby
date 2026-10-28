-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineVersion" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineDay" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "rest" BOOLEAN NOT NULL,

    CONSTRAINT "RoutineDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineItem" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "minReps" INTEGER NOT NULL,
    "maxReps" INTEGER NOT NULL,
    "rir" INTEGER,
    "benchAngle" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "RoutineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_ownerId_updatedAt_idx" ON "Routine"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineVersion_routineId_number_key" ON "RoutineVersion"("routineId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineDay_versionId_weekday_key" ON "RoutineDay"("versionId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineItem_dayId_position_key" ON "RoutineItem"("dayId", "position");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineVersion" ADD CONSTRAINT "RoutineVersion_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineDay" ADD CONSTRAINT "RoutineDay_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RoutineVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

