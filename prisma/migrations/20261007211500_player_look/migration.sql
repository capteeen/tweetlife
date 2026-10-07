-- AlterTable: existing players keep their seeded look (look NULL, lookPending false).
ALTER TABLE "Player" ADD COLUMN "look" JSONB,
ADD COLUMN "lookPending" BOOLEAN NOT NULL DEFAULT false;
