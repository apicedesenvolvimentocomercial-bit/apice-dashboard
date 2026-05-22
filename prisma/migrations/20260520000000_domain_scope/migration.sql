-- Reforma "divisão total" — Fase 1: escopo de domínio garantido por clientId.
-- 100% ADITIVA: colunas nullable + índices + FK ON DELETE SET NULL. Sem
-- NOT NULL, sem drop, sem reset. Backfill idempotente no fim (guard IS NULL).

-- 1) Colunas de escopo (nullable). clientId != null ⇒ domínio clínica.
ALTER TABLE "CalendarEvent" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Notification"  ADD COLUMN "clientId" TEXT;

-- 2) Índices que cobrem where+orderBy das listagens por domínio (Fases 3/4/2).
CREATE INDEX "Activity_clientId_status_dueDate_idx" ON "Activity"("clientId", "status", "dueDate");
CREATE INDEX "CalendarEvent_clientId_startAt_idx" ON "CalendarEvent"("clientId", "startAt");
CREATE INDEX "Notification_clientId_readAt_idx" ON "Notification"("clientId", "readAt");

-- 3) FKs. SET NULL: apagar uma clínica não apaga histórico de evento/notificação.
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification"  ADD CONSTRAINT "Notification_clientId_fkey"  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Backfill: deriva clientId do dono/destinatário (User.clientId). Idempotente
--    (só preenche linhas ainda nulas). Eventos/notificações de agência (User sem
--    clientId) permanecem null = domínio admin.
UPDATE "CalendarEvent" ce
   SET "clientId" = u."clientId"
  FROM "User" u
 WHERE ce."userId" = u."id"
   AND u."clientId" IS NOT NULL
   AND ce."clientId" IS NULL;

UPDATE "Notification" n
   SET "clientId" = u."clientId"
  FROM "User" u
 WHERE n."userId" = u."id"
   AND u."clientId" IS NOT NULL
   AND n."clientId" IS NULL;
