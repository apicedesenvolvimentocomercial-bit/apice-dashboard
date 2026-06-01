-- Item 1: atividade orientada a cliente. Atividade de CLÍNICA passa a apontar
-- para EXATAMENTE um de leadId/patientId (regra app-enforced na action). Colunas
-- nullable: atividades de AGÊNCIA (domain ADMIN) e as legadas ficam sem alvo.

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "patientId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_leadId_idx" ON "Activity"("leadId");

-- CreateIndex
CREATE INDEX "Activity_patientId_idx" ON "Activity"("patientId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
