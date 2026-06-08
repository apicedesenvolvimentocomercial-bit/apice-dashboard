-- Categoria semântica do funil (LEAD/PATIENT/OTHER) — rege o fluxo ao mover um card
-- entre funis. Backfill: Comercial→LEAD, Retenção→PATIENT, custom fica OTHER (default).
-- Pipeline já está na RLS (tem clientId); só adicionamos coluna (sem nova policy).
CREATE TYPE "PipelineCategory" AS ENUM ('LEAD', 'PATIENT', 'OTHER');

ALTER TABLE "Pipeline"
  ADD COLUMN "category" "PipelineCategory" NOT NULL DEFAULT 'OTHER';

UPDATE "Pipeline" SET "category" = 'LEAD' WHERE "kind" = 'COMMERCIAL';
UPDATE "Pipeline" SET "category" = 'PATIENT' WHERE "kind" = 'RETENTION';
