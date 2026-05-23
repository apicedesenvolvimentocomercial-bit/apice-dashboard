-- Conserto: RevenueProcedure precisa de clientId (faltou na 20260523120000) p/ a
-- policy de RLS tenant_isolation (Fase 11). Sem isso, a criação de receita com
-- procedimentos falha com P2022 (column "clientId" does not exist).

-- AlterTable: adiciona clientId (nullable p/ backfill)
ALTER TABLE "RevenueProcedure" ADD COLUMN "clientId" TEXT;

-- Backfill das linhas existentes a partir da receita-pai
UPDATE "RevenueProcedure" rp
SET "clientId" = r."clientId"
FROM "Revenue" r
WHERE rp."revenueId" = r."id";

-- Agora obrigatório
ALTER TABLE "RevenueProcedure" ALTER COLUMN "clientId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RevenueProcedure_clientId_idx" ON "RevenueProcedure"("clientId");

-- AddForeignKey
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================
-- RLS (Fase 11): isola RevenueProcedure por clínica, mesmo template das demais.
-- =====================================================
ALTER TABLE "RevenueProcedure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RevenueProcedure" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RevenueProcedure";
CREATE POLICY tenant_isolation ON "RevenueProcedure" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true));
