-- AlterTable: everyone starts without a nationality and is asked once (skipping makes them Solanan).
ALTER TABLE "Player" ADD COLUMN "nationality" TEXT;
