-- Pipelines variáveis por clínica (≤6) substituem o antigo `StageKind`
-- (NEW/EXISTING) fixo. Cada clínica passa a ter N funis (`Pipeline`), e cada
-- `PipelineStage` aponta para um `pipelineId` em vez de carregar `kind`.
--
-- As duas nativas: COMMERCIAL (antigo NEW) e RETENTION (antigo EXISTING). Suas
-- etapas seed ganham `isNative=true` (não excluíveis — recebem função de
-- negócio). Ver `prompt/pipelines-progresso.md`.

-- 1. Enum do tipo de pipeline.
CREATE TYPE "PipelineKind" AS ENUM ('COMMERCIAL', 'RETENTION', 'CUSTOM');

-- 2. Tabela Pipeline.
CREATE TABLE "Pipeline" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "kind"           "PipelineKind" NOT NULL DEFAULT 'CUSTOM',
  "order"          INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Pipeline"
  ADD CONSTRAINT "Pipeline_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Pipeline_clientId_order_key" ON "Pipeline" ("clientId", "order");
CREATE INDEX "Pipeline_clientId_idx" ON "Pipeline" ("clientId");
CREATE INDEX "Pipeline_organizationId_clientId_idx" ON "Pipeline" ("organizationId", "clientId");

-- 3. Cria uma Pipeline por (clientId, kind) existente em PipelineStage.
--    NEW → COMMERCIAL (order 0), EXISTING → RETENTION (order 1). O id é gerado
--    com gen_random_uuid() (não cuid, mas é interno e único — ok). organizationId
--    vem do Client (mantém a invariante desnormalizada).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "Pipeline" ("id", "organizationId", "clientId", "name", "kind", "order")
SELECT
  gen_random_uuid()::text,
  c."organizationId",
  s."clientId",
  CASE s."kind" WHEN 'NEW' THEN 'Comercial' ELSE 'Retenção' END,
  (CASE s."kind" WHEN 'NEW' THEN 'COMMERCIAL' ELSE 'RETENTION' END)::"PipelineKind",
  CASE s."kind" WHEN 'NEW' THEN 0 ELSE 1 END
FROM (SELECT DISTINCT "clientId", "kind" FROM "PipelineStage") s
JOIN "Client" c ON c."id" = s."clientId";

-- 4. Coluna pipelineId em PipelineStage (nullable durante o backfill).
ALTER TABLE "PipelineStage" ADD COLUMN "pipelineId" TEXT;
ALTER TABLE "PipelineStage" ADD COLUMN "isNative" BOOLEAN NOT NULL DEFAULT false;

-- 5. Backfill: liga cada stage à pipeline da sua (clientId, kind).
UPDATE "PipelineStage" st
SET "pipelineId" = p."id"
FROM "Pipeline" p
WHERE p."clientId" = st."clientId"
  AND p."kind" = (CASE st."kind" WHEN 'NEW' THEN 'COMMERCIAL' ELSE 'RETENTION' END)::"PipelineKind";

-- 6. Marca como nativas as etapas seed das pipelines nativas.
--    COMMERCIAL: Lead/Agendado/Compareceu/Fechado/No-show.
--    RETENTION: Ativo/Inativo (Em tratamento NÃO é nativa — fica livre).
--    Usa isWon/isLost p/ Fechado/No-show (nome pode ter sido customizado).
UPDATE "PipelineStage" st
SET "isNative" = true
FROM "Pipeline" p
WHERE p."id" = st."pipelineId"
  AND (
    (p."kind" = 'COMMERCIAL' AND (
       st."name" IN ('Lead', 'Agendado', 'Compareceu') OR st."isWon" = true OR st."isLost" = true
    ))
    OR
    (p."kind" = 'RETENTION' AND st."name" IN ('Ativo', 'Inativo'))
  );

-- 7. pipelineId obrigatório + FK + índices; troca o unique para (pipelineId, order).
ALTER TABLE "PipelineStage" ALTER COLUMN "pipelineId" SET NOT NULL;
ALTER TABLE "PipelineStage"
  ADD CONSTRAINT "PipelineStage_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "PipelineStage_clientId_kind_order_key";
DROP INDEX IF EXISTS "PipelineStage_clientId_kind_idx";

ALTER TABLE "PipelineStage" DROP COLUMN "kind";
DROP TYPE "StageKind";

CREATE UNIQUE INDEX "PipelineStage_pipelineId_order_key" ON "PipelineStage" ("pipelineId", "order");
CREATE INDEX "PipelineStage_clientId_idx" ON "PipelineStage" ("clientId");
CREATE INDEX "PipelineStage_pipelineId_idx" ON "PipelineStage" ("pipelineId");

-- 8. RLS para Pipeline (mesma policy de tenant_isolation por clientId).
ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pipeline" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Pipeline";
CREATE POLICY tenant_isolation ON "Pipeline" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true));
