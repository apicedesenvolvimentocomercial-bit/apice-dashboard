-- Item 7: eventos recorrentes no calendário. As ocorrências de uma série
-- compartilham `recurrenceGroupId` (marca a série → exclusão em massa).

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "recurrenceGroupId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarEvent_recurrenceGroupId_idx" ON "CalendarEvent"("recurrenceGroupId");
