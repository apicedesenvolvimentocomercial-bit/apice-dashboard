-- Item 5: janela de cancelamento → no-show + renomeia a etapa nativa "No-show"
-- para "Cancelado" (rótulo mais abrangente; o sistema decide se é no-show).

-- 1) Configuração por clínica: horas antes do horário dentro das quais um
--    cancelamento conta como no-show. NULL = regra do mesmo dia (default).
ALTER TABLE "Client" ADD COLUMN "noShowWindowHours" INTEGER;

-- 2) Renomeia a etapa nativa de desfecho para "Cancelado" nas clínicas legadas.
--    Só toca as que ainda usam o rótulo padrão "No-show" (não mexe em renomeações
--    feitas pela própria clínica). nativeKey permanece NO_SHOW (identidade estável).
UPDATE "PipelineStage"
SET "name" = 'Cancelado'
WHERE "nativeKey" = 'NO_SHOW' AND "name" = 'No-show';
