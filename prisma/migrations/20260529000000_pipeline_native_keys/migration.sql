-- Fase 2.0 — fundação das funções de negócio das pipelines nativas.
--   a) PipelineStage.nativeKey: identidade ESTÁVEL da etapa nativa (o nome é
--      renomeável). O código decide o efeito do drag por este campo.
--   b) Lead.appointmentId: vínculo 1:1 com o Appointment gerado no SCHEDULED,
--      usado pelo Fechado (verificar/baixar) e pelo retrocesso (desfazer).
-- Nenhuma tabela nova → RLS inalterada (colunas vivem em tabelas já protegidas).

-- 1. Enum.
CREATE TYPE "StageNativeKey" AS ENUM (
  'LEAD', 'SCHEDULED', 'ATTENDED', 'CLOSED', 'NO_SHOW', 'ACTIVE', 'INACTIVE'
);

-- 2. Coluna nativeKey (nullable; só nativas recebem valor).
ALTER TABLE "PipelineStage" ADD COLUMN "nativeKey" "StageNativeKey";

-- 3. Backfill das nativas existentes pela (pipeline.kind, order/flags).
--    COMMERCIAL: order 0→LEAD, 1→SCHEDULED, 2→ATTENDED; isWon→CLOSED; isLost→NO_SHOW.
--    (isWon/isLost têm precedência — Fechado/No-show podem ter sido reordenados.)
UPDATE "PipelineStage" st
SET "nativeKey" = CASE
    WHEN st."isWon"  THEN 'CLOSED'::"StageNativeKey"
    WHEN st."isLost" THEN 'NO_SHOW'::"StageNativeKey"
    WHEN st."order" = 0 THEN 'LEAD'::"StageNativeKey"
    WHEN st."order" = 1 THEN 'SCHEDULED'::"StageNativeKey"
    WHEN st."order" = 2 THEN 'ATTENDED'::"StageNativeKey"
  END
FROM "Pipeline" p
WHERE p."id" = st."pipelineId"
  AND p."kind" = 'COMMERCIAL'
  AND st."isNative" = true;

--    RETENTION: 'Ativo'→ACTIVE, 'Inativo'→INACTIVE (nome seed; nativas marcadas).
UPDATE "PipelineStage" st
SET "nativeKey" = CASE
    WHEN st."name" = 'Ativo'   THEN 'ACTIVE'::"StageNativeKey"
    WHEN st."name" = 'Inativo' THEN 'INACTIVE'::"StageNativeKey"
  END
FROM "Pipeline" p
WHERE p."id" = st."pipelineId"
  AND p."kind" = 'RETENTION'
  AND st."isNative" = true
  AND st."name" IN ('Ativo', 'Inativo');

-- 4. Lead.appointmentId (1:1 com Appointment).
ALTER TABLE "Lead" ADD COLUMN "appointmentId" TEXT;
CREATE UNIQUE INDEX "Lead_appointmentId_key" ON "Lead" ("appointmentId");
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
