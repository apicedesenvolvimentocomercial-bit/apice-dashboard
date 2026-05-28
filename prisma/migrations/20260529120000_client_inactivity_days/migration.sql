-- Fase 2e — janela de inatividade configurável por clínica. Após N dias sem
-- Appointment ATTENDED nem Revenue, o cron de retenção move o card do paciente
-- para a etapa INACTIVE da pipeline RETENTION. Default 30 dias.
ALTER TABLE "Client" ADD COLUMN "inactivityDays" INTEGER NOT NULL DEFAULT 30;
