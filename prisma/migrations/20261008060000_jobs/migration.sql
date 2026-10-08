-- CreateTable
CREATE TABLE "JobRecord" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "shifts" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shiftStartedAt" TIMESTAMP(3),
    "shiftTasks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRecord_playerId_active_idx" ON "JobRecord"("playerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "JobRecord_playerId_jobId_key" ON "JobRecord"("playerId", "jobId");

-- AddForeignKey
ALTER TABLE "JobRecord" ADD CONSTRAINT "JobRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

