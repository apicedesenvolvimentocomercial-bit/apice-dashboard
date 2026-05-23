-- Receita com múltiplos procedimentos + custo de procedimento vinculado.

-- CreateTable: itens de procedimento por receita (price/cost = snapshot no lançamento)
-- `clientId` presente p/ a policy de RLS tenant_isolation (Fase 11), igual às demais tabelas.
CREATE TABLE "RevenueProcedure" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevenueProcedure_revenueId_idx" ON "RevenueProcedure"("revenueId");
CREATE INDEX "RevenueProcedure_procedureId_idx" ON "RevenueProcedure"("procedureId");
CREATE INDEX "RevenueProcedure_clientId_idx" ON "RevenueProcedure"("clientId");

-- AddForeignKey
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: custo gerado a partir de procedimento de receita
ALTER TABLE "Cost" ADD COLUMN "revenueId" TEXT;

-- CreateIndex
CREATE INDEX "Cost_revenueId_idx" ON "Cost"("revenueId");

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================
-- RLS (Fase 11): isola RevenueProcedure por clínica, mesmo template das demais.
-- Ver prisma/migrations/20260522000000_rls_tenant_isolation/migration.sql.
-- FORCE garante que vale até p/ o dono da tabela (role do Prisma).
-- =====================================================
ALTER TABLE "RevenueProcedure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RevenueProcedure" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RevenueProcedure";
CREATE POLICY tenant_isolation ON "RevenueProcedure" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
    OR "clientId" = current_setting('app.current_client_id', true));
