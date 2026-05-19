-- Renomeia o estágio "Perdido" (isLost=true) para "No-show" nas clínicas
-- existentes. Apenas atualiza o nome quando ainda é o default seed — clínicas
-- que customizaram o nome do estágio "perdido" mantêm a escolha delas.
UPDATE "PipelineStage"
SET name = 'No-show'
WHERE name = 'Perdido'
  AND "isLost" = TRUE;
