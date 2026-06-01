-- Item 4: pipelines/agenda pessoais (cards por dono). Campos escalares de dono
-- (sem FK, como Lead.assignedToId). Pipeline nativa = ownerId NULL (estrutura
-- compartilhada). Agendamento ganha responsável.

-- AlterTable
ALTER TABLE "Pipeline" ADD COLUMN "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "assignedToId" TEXT;

-- CreateIndex
CREATE INDEX "Pipeline_clientId_ownerId_idx" ON "Pipeline"("clientId", "ownerId");

-- CreateIndex
CREATE INDEX "Appointment_clientId_assignedToId_idx" ON "Appointment"("clientId", "assignedToId");
