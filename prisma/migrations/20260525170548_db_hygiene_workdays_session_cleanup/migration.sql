-- Higiene de schema:
--   1. Remove ClinicRole.organizationId — campo morto (escrito 1x na criação,
--      nunca lido; o escopo do cargo vem 100% de clientId). Sem FK/índice.
--   2. Client.workdays: CSV text "1,2,3,4,5,6" → int[] nativo (1ª NF). A UI
--      sempre tratou como number[]; só o repositório serializava. Converte os
--      dados existentes via string_to_array.
--   3. Session: índices em userId (lookup por usuário) e expires (varredura do
--      job de limpeza de sessões vencidas).

-- 1. ClinicRole.organizationId (campo morto) ------------------------------
ALTER TABLE "ClinicRole" DROP COLUMN "organizationId";

-- 2. Client.workdays: text CSV → int[] ------------------------------------
-- Remove o default antigo (texto) antes de trocar o tipo, senão o cast do
-- default falha. Converte cada linha existente: "1,2,3" → ARRAY[1,2,3].
ALTER TABLE "Client" ALTER COLUMN "workdays" DROP DEFAULT;
ALTER TABLE "Client"
  ALTER COLUMN "workdays" TYPE INTEGER[]
  USING string_to_array("workdays", ',')::INTEGER[];
ALTER TABLE "Client" ALTER COLUMN "workdays" SET DEFAULT ARRAY[1, 2, 3, 4, 5, 6];

-- 3. Índices de Session ---------------------------------------------------
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expires_idx" ON "Session"("expires");
