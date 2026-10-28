-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchText" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "execution" TEXT NOT NULL,
    "measurement" TEXT NOT NULL,
    "benchAngle" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_ownerId_active_idx" ON "Exercise"("ownerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_scopeKey_nameKey_key" ON "Exercise"("scopeKey", "nameKey");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Exercise" ALTER COLUMN "aliases" SET NOT NULL;
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_scope_check" CHECK (
  ("ownerId" IS NULL AND "scopeKey" = 'shared') OR
  ("ownerId" IS NOT NULL AND "scopeKey" = 'user:' || "ownerId")
);
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_version_check" CHECK ("version" >= 1);

