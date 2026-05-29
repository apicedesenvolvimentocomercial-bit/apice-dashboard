-- Item 8: múltiplos procedimentos de interesse por lead. Lista estruturada de
-- ids de Procedure usada para somar o valor estimado na criação do lead.
ALTER TABLE "Lead" ADD COLUMN "procedureInterestIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
