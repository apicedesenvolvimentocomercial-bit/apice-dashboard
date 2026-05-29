-- Itens 6/7: distingue paciente "real" de fantasma de agendamento. true = criado
-- ao agendar um lead (pode ter dado no-show). A aba Pacientes filtra por isto +
-- comparecimento real. Registros existentes ficam false (visíveis).
ALTER TABLE "Patient" ADD COLUMN "fromScheduledLead" BOOLEAN NOT NULL DEFAULT false;
