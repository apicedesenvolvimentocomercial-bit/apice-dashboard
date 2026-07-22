-- Remove Goal.notes: o campo "Observações" saiu do popup de metas (era inútil ali
-- — a meta já se descreve por métrica/período/alvo/escopo) e nenhum caminho da app
-- lê ou escreve mais a coluna. Coluna FOLHA: sem FK, sem índice, fora da RLS
-- (a policy é por clientId, na tabela). O conteúdo existente é descartado junto.
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "notes";
