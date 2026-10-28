ALTER TABLE "WorkoutSet"
 ADD COLUMN "side" TEXT NOT NULL DEFAULT 'unspecified',
 ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'working',
 ADD COLUMN "actualRir" INTEGER,
 ADD CONSTRAINT "WorkoutSet_side_check" CHECK ("side" IN ('unspecified', 'both', 'left', 'right')),
 ADD CONSTRAINT "WorkoutSet_kind_check" CHECK ("kind" IN ('working', 'warmup')),
 ADD CONSTRAINT "WorkoutSet_rir_check" CHECK ("actualRir" IS NULL OR ("actualRir" BETWEEN 0 AND 10 AND "completed"));
