-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "workdayEnd" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "workdayStart" TEXT NOT NULL DEFAULT '07:00',
ADD COLUMN     "workdays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6';

-- CreateTable
CREATE TABLE "ClinicHoliday" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicHoliday_clientId_idx" ON "ClinicHoliday"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicHoliday_clientId_date_key" ON "ClinicHoliday"("clientId", "date");

-- AddForeignKey
ALTER TABLE "ClinicHoliday" ADD CONSTRAINT "ClinicHoliday_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
