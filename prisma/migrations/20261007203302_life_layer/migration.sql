-- AlterTable
ALTER TABLE "VisitorSession" ADD COLUMN     "visitorId" TEXT;

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "bags" INTEGER NOT NULL DEFAULT 10000,
    "vibes" INTEGER NOT NULL DEFAULT 70,
    "clout" INTEGER NOT NULL DEFAULT 50,
    "gas" INTEGER NOT NULL DEFAULT 80,
    "status" TEXT NOT NULL DEFAULT 'Just arrived',
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "costBasis" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BagTx" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BagTx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestDay" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "claimed" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "QuestDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Holding_playerId_chain_address_key" ON "Holding"("playerId", "chain", "address");

-- CreateIndex
CREATE INDEX "BagTx_playerId_at_idx" ON "BagTx"("playerId", "at");

-- CreateIndex
CREATE INDEX "Interaction_fromUserId_at_idx" ON "Interaction"("fromUserId", "at");

-- CreateIndex
CREATE INDEX "Interaction_toUserId_at_idx" ON "Interaction"("toUserId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "QuestDay_playerId_day_key" ON "QuestDay"("playerId", "day");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BagTx" ADD CONSTRAINT "BagTx_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDay" ADD CONSTRAINT "QuestDay_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
