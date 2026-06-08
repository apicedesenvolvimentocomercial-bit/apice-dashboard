-- Reforma da retenção (retencao-reforma-progresso.md), parte 2/2.
-- Pré-requisito: a migration ..._retention_lifecycle_enum (parte 1) já adicionou os
-- 5 valores ao enum StageNativeKey numa transação anterior — aqui já podem ser usados.

-- ============================================================
-- 1. Colunas novas
-- ============================================================
-- Corte Reativação→Salvamento na pipeline de retenção.
ALTER TABLE "Client" ADD COLUMN "winbackDays" INTEGER NOT NULL DEFAULT 120;
-- Janela de recorrência / fim do efeito do procedimento (null = procedimento único).
ALTER TABLE "Procedure" ADD COLUMN "recurrenceDays" INTEGER;
-- Retorno esperado denormalizado (UI + cron). Setado ao comparecer.
ALTER TABLE "Patient" ADD COLUMN "nextReturnDueAt" TIMESTAMP(3);

-- ============================================================
-- 2. Mensageria ao paciente (fundação p/ WhatsApp real)
-- ============================================================
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');
CREATE TYPE "OutboundMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTemplate_clientId_key_key" ON "MessageTemplate"("clientId", "key");
CREATE INDEX "MessageTemplate_organizationId_clientId_idx" ON "MessageTemplate"("organizationId", "clientId");

ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "patientId" TEXT,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "templateKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "error" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundMessage_dedupeKey_key" ON "OutboundMessage"("dedupeKey");
CREATE INDEX "OutboundMessage_organizationId_clientId_idx" ON "OutboundMessage"("organizationId", "clientId");
CREATE INDEX "OutboundMessage_clientId_status_scheduledFor_idx" ON "OutboundMessage"("clientId", "status", "scheduledFor");

ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (mesma policy tenant_isolation; grants ao role da app via ALTER DEFAULT
-- PRIVILEGES — ver prisma/rls-setup-role.ts). Tabelas com clientId DEVEM entrar aqui.
ALTER TABLE "MessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MessageTemplate";
CREATE POLICY tenant_isolation ON "MessageTemplate" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true));

ALTER TABLE "OutboundMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundMessage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OutboundMessage";
CREATE POLICY tenant_isolation ON "OutboundMessage" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true));

-- ============================================================
-- 3. Backfill: pipelines RETENTION existentes (2 etapas → 5 do ciclo de vida)
-- ============================================================
-- Cada pipeline RETENTION ganha as 5 etapas nativas (POST_CARE→WINBACK). Cards na
-- antiga ACTIVE migram p/ NURTURE; INACTIVE p/ WINBACK. O cron de retenção recalcula
-- o bucket de cada card na próxima rodada, então a posição exata aqui é só o ponto
-- de partida. Etapas LIVRES da clínica são preservadas (ficam após as nativas).
-- Idempotente: pula a pipeline se POST_CARE já existir.
DO $$
DECLARE
  p RECORD;
  active_id TEXT;
  inactive_id TEXT;
  post_id TEXT;
  nurture_id TEXT;
  reactivation_id TEXT;
  loyalty_id TEXT;
  winback_id TEXT;
  cid TEXT;
BEGIN
  FOR p IN SELECT id, "clientId" FROM "Pipeline" WHERE "kind" = 'RETENTION' LOOP
    -- reset por iteração (variáveis PL/pgSQL retêm valor entre voltas do loop)
    active_id := NULL;
    inactive_id := NULL;
    cid := p."clientId";

    IF EXISTS (SELECT 1 FROM "PipelineStage" WHERE "pipelineId" = p.id AND "nativeKey" = 'POST_CARE') THEN
      CONTINUE;
    END IF;

    -- abre espaço nos orders baixos (sem colidir com o unique (pipelineId, order))
    UPDATE "PipelineStage" SET "order" = "order" + 100 WHERE "pipelineId" = p.id;

    post_id := gen_random_uuid()::text;
    nurture_id := gen_random_uuid()::text;
    reactivation_id := gen_random_uuid()::text;
    loyalty_id := gen_random_uuid()::text;
    winback_id := gen_random_uuid()::text;

    INSERT INTO "PipelineStage" ("id","clientId","pipelineId","name","order","color","isWon","isLost","isNative","nativeKey","createdAt") VALUES
      (post_id,         cid, p.id, 'Pós-procedimento', 0, '#a855f7', false, false, true, 'POST_CARE',    CURRENT_TIMESTAMP),
      (nurture_id,      cid, p.id, 'Nutrição',         1, '#22c55e', false, false, true, 'NURTURE',      CURRENT_TIMESTAMP),
      (reactivation_id, cid, p.id, 'Reativação',       2, '#f59e0b', false, false, true, 'REACTIVATION', CURRENT_TIMESTAMP),
      (loyalty_id,      cid, p.id, 'Fidelização',      3, '#3b82f6', false, false, true, 'LOYALTY',      CURRENT_TIMESTAMP),
      (winback_id,      cid, p.id, 'Salvamento',       4, '#ef4444', false, false, true, 'WINBACK',      CURRENT_TIMESTAMP);

    SELECT "id" INTO active_id   FROM "PipelineStage" WHERE "pipelineId" = p.id AND "nativeKey" = 'ACTIVE'   LIMIT 1;
    SELECT "id" INTO inactive_id FROM "PipelineStage" WHERE "pipelineId" = p.id AND "nativeKey" = 'INACTIVE' LIMIT 1;

    IF active_id IS NOT NULL THEN
      UPDATE "Lead" SET "stageId" = nurture_id WHERE "stageId" = active_id;
      DELETE FROM "PipelineStage" WHERE "id" = active_id;
    END IF;
    IF inactive_id IS NOT NULL THEN
      UPDATE "Lead" SET "stageId" = winback_id WHERE "stageId" = inactive_id;
      DELETE FROM "PipelineStage" WHERE "id" = inactive_id;
    END IF;
  END LOOP;
END $$;
