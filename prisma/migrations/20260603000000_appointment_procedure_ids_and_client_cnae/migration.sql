-- Item 2: múltiplos procedimentos por agendamento (combos). `procedureId` segue
-- como o PRINCIPAL (= procedureIds[0]) p/ compat com relatórios/filtros; a baixa
-- soma os preços de todos. Coluna escalar em tabela já sob RLS → sem policy nova.
ALTER TABLE "Appointment" ADD COLUMN "procedureIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: agendamentos existentes ficam com o procedimento atual como o único
-- item da lista (mantém a invariante procedureIds[0] == procedureId).
UPDATE "Appointment" SET "procedureIds" = ARRAY["procedureId"];

-- Item 7: CNAE (Classificação Nacional de Atividades Econômicas) da clínica.
-- Campo fiscal informativo, opcional. Client já está sob RLS → sem policy nova.
ALTER TABLE "Client" ADD COLUMN "cnae" TEXT;
