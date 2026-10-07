/*
  Warnings:

  - You are about to drop the `Holding` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Holding" DROP CONSTRAINT "Holding_playerId_fkey";

-- DropTable
DROP TABLE "Holding";

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTx" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "mint" TEXT,
    "signature" TEXT,
    "note" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_publicKey_key" ON "Wallet"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTx_signature_key" ON "WalletTx"("signature");

-- CreateIndex
CREATE INDEX "WalletTx_playerId_at_idx" ON "WalletTx"("playerId", "at");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_id_fkey" FOREIGN KEY ("id") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTx" ADD CONSTRAINT "WalletTx_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
