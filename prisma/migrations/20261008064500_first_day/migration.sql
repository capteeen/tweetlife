-- The guided first day: a state on the player, and one row per finished step (its reward is paid once).
ALTER TABLE "Player" ADD COLUMN "firstDay" TEXT;

CREATE TABLE "FirstDayStep" (
    "playerId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "reward" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirstDayStep_pkey" PRIMARY KEY ("playerId","step")
);

ALTER TABLE "FirstDayStep" ADD CONSTRAINT "FirstDayStep_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
