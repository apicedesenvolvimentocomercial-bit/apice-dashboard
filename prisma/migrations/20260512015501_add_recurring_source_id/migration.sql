-- AlterTable
ALTER TABLE "Cost" ADD COLUMN     "recurringSourceId" TEXT;

-- CreateIndex
CREATE INDEX "Cost_recurringSourceId_date_idx" ON "Cost"("recurringSourceId", "date");

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_recurringSourceId_fkey" FOREIGN KEY ("recurringSourceId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
