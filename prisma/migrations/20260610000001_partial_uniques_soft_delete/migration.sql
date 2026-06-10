-- I1 (plano de correções): soft-delete × unique. O registro soft-deletado
-- continuava ocupando a chave única → recriar categoria/template com o mesmo
-- nome dava P2002 (erro genérico na UI). Os uniques viram PARCIAIS (só linhas
-- vivas), mesmo padrão do índice parcial do PipelineDeal.

DROP INDEX "ProcedureCategory_clientId_name_key";
CREATE UNIQUE INDEX "ProcedureCategory_clientId_name_active_key"
  ON "ProcedureCategory"("clientId", "name")
  WHERE "deletedAt" IS NULL;

DROP INDEX "MessageTemplate_clientId_key_key";
CREATE UNIQUE INDEX "MessageTemplate_clientId_key_active_key"
  ON "MessageTemplate"("clientId", "key")
  WHERE "deletedAt" IS NULL;

-- O schema.prisma trocou o @@unique por @@index([clientId, key]) no
-- MessageTemplate (lookup do resolveTemplate); cria aqui o índice simples.
CREATE INDEX "MessageTemplate_clientId_key_idx" ON "MessageTemplate"("clientId", "key");
