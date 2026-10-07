-- Memecoins bought with bags at the Coin Shop (paper positions, priced live).
CREATE TABLE "PaperCoin" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "icon" TEXT,
    "units" DOUBLE PRECISION NOT NULL,
    "costBags" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperCoin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaperCoin_playerId_mint_key" ON "PaperCoin"("playerId", "mint");

ALTER TABLE "PaperCoin" ADD CONSTRAINT "PaperCoin_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
