-- DRE (regime de competência) — ledger prompt/dre-progresso.md, Etapa A.
-- Competência na Revenue + contas a receber (Receivable) + ativos (FixedAsset) +
-- multi-regime tributário (Client.taxRegime + split do CostType).

-- 1) Regime tributário da clínica
CREATE TYPE "TaxRegime" AS ENUM ('SIMPLES', 'PRESUMIDO', 'REAL');
ALTER TABLE "Client" ADD COLUMN "taxRegime" "TaxRegime" NOT NULL DEFAULT 'SIMPLES';

-- 2) Enums novos da DRE
CREATE TYPE "RevenueType" AS ENUM ('PROCEDIMENTO', 'PACOTE', 'RECORRENCIA', 'PRODUTO', 'OUTRA', 'FINANCEIRA');
CREATE TYPE "RevenueStatus" AS ENUM ('ABERTA', 'QUITADA', 'CANCELADA');
CREATE TYPE "ReceivableStatus" AS ENUM ('PENDENTE', 'PAGO', 'PERDIDO', 'CANCELADO');
CREATE TYPE "AssetKind" AS ENUM ('TANGIVEL', 'INTANGIVEL');
CREATE TYPE "DepreciationMethod" AS ENUM ('LINEAR');

-- 3) CostType: renomeia TAX -> TAX_REVENUE (linhas existentes migram sozinhas) e
-- adiciona os tipos novos da taxonomia da DRE.
ALTER TYPE "CostType" RENAME VALUE 'TAX' TO 'TAX_REVENUE';
ALTER TYPE "CostType" ADD VALUE 'TAX_PROFIT';
ALTER TYPE "CostType" ADD VALUE 'COMMISSION';
ALTER TYPE "CostType" ADD VALUE 'COMMERCIAL';
ALTER TYPE "CostType" ADD VALUE 'ADMINISTRATIVE';
ALTER TYPE "CostType" ADD VALUE 'FINANCIAL_EXPENSE';

-- 4) Revenue: campos de competência. grossAmount NOT NULL via default 0 -> backfill
-- = amount -> drop default (estado final = NOT NULL sem default, igual ao schema).
ALTER TABLE "Revenue" ADD COLUMN "type" "RevenueType" NOT NULL DEFAULT 'OUTRA';
ALTER TABLE "Revenue" ADD COLUMN "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Revenue" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Revenue" ADD COLUMN "status" "RevenueStatus" NOT NULL DEFAULT 'ABERTA';
ALTER TABLE "Revenue" ADD COLUMN "canceledAt" TIMESTAMP(3);
ALTER TABLE "Revenue" ADD COLUMN "cancelReason" TEXT;

UPDATE "Revenue" SET
  "grossAmount" = "amount",
  "status" = 'QUITADA',
  "type" = CASE WHEN "procedureId" IS NOT NULL THEN 'PROCEDIMENTO'::"RevenueType" ELSE 'OUTRA'::"RevenueType" END;

ALTER TABLE "Revenue" ALTER COLUMN "grossAmount" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Revenue_clientId_status_idx" ON "Revenue"("clientId", "status");

-- 5) Receivable (contas a receber por parcela)
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "revenueId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDENTE',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Receivable_clientId_dueDate_idx" ON "Receivable"("clientId", "dueDate");
CREATE INDEX "Receivable_clientId_status_idx" ON "Receivable"("clientId", "status");
CREATE INDEX "Receivable_revenueId_idx" ON "Receivable"("revenueId");
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) FixedAsset (módulo de ativos)
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "kind" "AssetKind" NOT NULL DEFAULT 'TANGIVEL',
    "acquisitionValue" DECIMAL(12,2) NOT NULL,
    "residualValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'LINEAR',
    "disposedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FixedAsset_clientId_idx" ON "FixedAsset"("clientId");
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7) RLS p/ as tabelas novas com clientId (obrigatório — ver rls-gambiarra.md).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['Receivable', 'FixedAsset'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      'USING (NULLIF(current_setting(''app.current_client_id'', true), '''') IS NULL '
      'OR "clientId" = current_setting(''app.current_client_id'', true)) '
      'WITH CHECK (NULLIF(current_setting(''app.current_client_id'', true), '''') IS NULL '
      'OR "clientId" = current_setting(''app.current_client_id'', true))',
      t
    );
  END LOOP;
END $$;
