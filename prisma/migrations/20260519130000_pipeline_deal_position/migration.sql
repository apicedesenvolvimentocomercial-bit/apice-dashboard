-- Ordenação manual dentro de cada coluna do pipeline. Float fracionário
-- permite inserir entre dois cards sem renumerar (1.0 → 1.5 → 2.0).
ALTER TABLE "PipelineDeal" ADD COLUMN "position" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: usa o instante de criação em milissegundos para garantir uma
-- ordem inicial estável e única por deal.
UPDATE "PipelineDeal"
SET "position" = EXTRACT(EPOCH FROM "createdAt") * 1000;

CREATE INDEX "PipelineDeal_organizationId_stage_position_idx"
  ON "PipelineDeal"("organizationId", "stage", "position");
