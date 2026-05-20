-- Substitui o unique total em (clientId) por um unique parcial que ignora
-- linhas soft-deletadas. Sem isso, uma clínica que já teve uma negociação
-- apagada não pode receber outra: o índice antigo enforça unicidade mesmo
-- contra registros com `deletedAt` setado, batendo com a checagem app-level
-- que só olha `deletedAt IS NULL`.
DROP INDEX IF EXISTS "PipelineDeal_clientId_key";

CREATE UNIQUE INDEX "PipelineDeal_clientId_active_key"
  ON "PipelineDeal"("clientId")
  WHERE "deletedAt" IS NULL;
