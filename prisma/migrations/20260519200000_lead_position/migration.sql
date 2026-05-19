-- Ordenação manual dentro de cada coluna do funil de leads. Float fracionário
-- permite inserir entre dois cards sem renumerar (1.0 → 1.5 → 2.0). Mesmo
-- padrão usado em PipelineDeal.position.
ALTER TABLE "Lead" ADD COLUMN "position" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: usa o instante de criação em milissegundos para garantir uma
-- ordem inicial estável e única por lead (mantém a ordem cronológica que
-- vinha sendo exibida na UI).
UPDATE "Lead"
SET "position" = EXTRACT(EPOCH FROM "createdAt") * 1000;

CREATE INDEX "Lead_clientId_stageId_position_idx"
  ON "Lead"("clientId", "stageId", "position");
