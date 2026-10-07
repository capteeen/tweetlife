-- DropIndex
DROP INDEX "IngestRun_status_idx";

-- AlterTable
ALTER TABLE "IngestRun" ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "notBefore" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "IngestRun_status_notBefore_idx" ON "IngestRun"("status", "notBefore");
