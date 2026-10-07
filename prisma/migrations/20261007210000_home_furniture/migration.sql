-- AlterTable: furniture lives in Asset too; vehicles have slot = NULL
ALTER TABLE "Asset" ADD COLUMN "slot" TEXT,
ADD COLUMN "stored" BOOLEAN NOT NULL DEFAULT false;
