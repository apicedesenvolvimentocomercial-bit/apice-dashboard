-- Preferência de sync atividade → calendário pessoal.
CREATE TYPE "ActivityCalendarSync" AS ENUM ('AUTO', 'ASK', 'NEVER');

ALTER TABLE "User" ADD COLUMN "activityCalendarSync" "ActivityCalendarSync" NOT NULL DEFAULT 'ASK';

-- Calendário pessoal por usuário. Eventos podem ser standalone (criados
-- direto no calendário) ou ligados 1:1 a uma Activity via activityId.
CREATE TABLE "CalendarEvent" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "startAt"        TIMESTAMP(3) NOT NULL,
    "endAt"          TIMESTAMP(3),
    "notes"          TEXT,
    "color"          TEXT,
    "category"       TEXT,
    "activityId"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEvent_activityId_key" ON "CalendarEvent"("activityId");
CREATE INDEX "CalendarEvent_userId_startAt_idx" ON "CalendarEvent"("userId", "startAt");
CREATE INDEX "CalendarEvent_organizationId_deletedAt_idx" ON "CalendarEvent"("organizationId", "deletedAt");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feriados da organização (compartilhados entre todos os usuários da org).
-- Separado de ClinicHoliday, que é por clínica.
CREATE TABLE "OrgHoliday" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date"           TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgHoliday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgHoliday_organizationId_date_key" ON "OrgHoliday"("organizationId", "date");
CREATE INDEX "OrgHoliday_organizationId_idx" ON "OrgHoliday"("organizationId");

ALTER TABLE "OrgHoliday" ADD CONSTRAINT "OrgHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
