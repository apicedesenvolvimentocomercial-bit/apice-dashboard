-- Pipeline duplo por clínica: funil de clientes NOVOS (leads) e funil de
-- clientes JÁ CADASTRADOS (pacientes). Cada PipelineStage passa a ter um `kind`
-- e o `order` é único POR funil, não mais global na clínica.

-- 1. Enum
CREATE TYPE "StageKind" AS ENUM ('NEW', 'EXISTING');

-- 2. Coluna kind (default NEW: todas as stages existentes são do funil antigo)
ALTER TABLE "PipelineStage"
  ADD COLUMN "kind" "StageKind" NOT NULL DEFAULT 'NEW';

-- 3. Troca a unicidade de (clientId, order) para (clientId, kind, order),
--    senão uma stage NEW e uma EXISTING não poderiam compartilhar o mesmo order.
--    Ambos eram índices (não constraints), criados pelo Prisma no init.
DROP INDEX IF EXISTS "PipelineStage_clientId_order_key";
DROP INDEX IF EXISTS "PipelineStage_clientId_idx";

CREATE UNIQUE INDEX "PipelineStage_clientId_kind_order_key" ON "PipelineStage" ("clientId", "kind", "order");
CREATE INDEX "PipelineStage_clientId_kind_idx" ON "PipelineStage" ("clientId", "kind");

-- As etapas default do funil EXISTING (Ativo/Em tratamento/Inativo) NÃO são
-- semeadas aqui: o app as cria sob demanda na primeira leitura do funil
-- (getPipeline), usando ids cuid como o restante das tabelas.
