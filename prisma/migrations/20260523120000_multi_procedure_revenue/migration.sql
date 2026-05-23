-- Receita com múltiplos procedimentos + custo de procedimento vinculado.

-- CreateTable: itens de procedimento por receita (price/cost = snapshot no lançamento)
CREATE TABLE "RevenueProcedure" (
    "id" TEXT NOT NULL,
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

-- AddForeignKey
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueProcedure" ADD CONSTRAINT "RevenueProcedure_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: custo gerado a partir de procedimento de receita
ALTER TABLE "Cost" ADD COLUMN "revenueId" TEXT;

-- CreateIndex
CREATE INDEX "Cost_revenueId_idx" ON "Cost"("revenueId");

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
