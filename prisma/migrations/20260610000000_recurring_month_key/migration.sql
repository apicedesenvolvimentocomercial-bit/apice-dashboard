-- H1 (plano de correções): anti-duplicação de custos recorrentes POR CONSTRAINT.
-- O job fazia check-then-act (findFirst → create); duas execuções concorrentes
-- criavam o mesmo custo 2× no mês. Agora (recurringSourceId, recurringMonthKey)
-- é único — NULLs (templates/custos avulsos) não colidem no Postgres.

ALTER TABLE "Cost" ADD COLUMN "recurringMonthKey" TEXT;

-- Backfill dos filhos existentes: mês derivado da própria data do lançamento.
UPDATE "Cost"
SET "recurringMonthKey" = to_char("date", 'YYYY-MM')
WHERE "recurringSourceId" IS NOT NULL;

CREATE UNIQUE INDEX "Cost_recurringSourceId_recurringMonthKey_key"
  ON "Cost"("recurringSourceId", "recurringMonthKey");
