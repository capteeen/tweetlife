-- Crime and police: a record on every player, and a ledger of steals and fights.
ALTER TABLE "Player" ADD COLUMN "wanted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "wantedAt" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "priors" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "jailedUntil" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "bail" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "jailCrimeId" TEXT;
ALTER TABLE "Player" ADD COLUMN "dazedUntil" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "peaceful" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "peacefulLockUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Crime" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "worldId" TEXT,
    "offenderId" TEXT,
    "offenderName" TEXT NOT NULL,
    "victimId" TEXT,
    "victimName" TEXT NOT NULL,
    "residentId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "report" TEXT,
    "reportedAt" TIMESTAMP(3),
    "arrested" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Crime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Crime_offenderId_at_idx" ON "Crime"("offenderId", "at");
CREATE INDEX "Crime_victimId_at_idx" ON "Crime"("victimId", "at");
