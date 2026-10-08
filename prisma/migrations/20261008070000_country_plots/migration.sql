-- Shared country maps: each player's posts city is one plot (block) on their home country's map.
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "worldId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plot_worldId_key" ON "Plot"("worldId");
CREATE UNIQUE INDEX "Plot_country_slot_key" ON "Plot"("country", "slot");

ALTER TABLE "Plot" ADD CONSTRAINT "Plot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
