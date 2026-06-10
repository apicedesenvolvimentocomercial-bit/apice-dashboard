-- J1 (plano de correções): a invariante organizationId == client.organizationId
-- era mantida SÓ por convenção de código (CLAUDE.md). Vira FK COMPOSTA:
-- (clientId, organizationId) → Client(id, organizationId). Um write que componha
-- organizationId de outra fonte passa a ser rejeitado PELO BANCO.
--
-- NOT VALID + VALIDATE: novas linhas são exigidas imediatamente; o VALIDATE
-- varre as existentes com lock leve. Se houver violação pré-existente em prod,
-- o VALIDATE (e o deploy) FALHAM — rode `npx dotenv -e .env -- tsx
-- prisma/org-invariant-check.ts` ANTES do deploy para conferir (read-only).
--
-- Modelos com clientId NULLABLE (Activity, CalendarEvent): MATCH SIMPLE (default)
-- ignora linhas com clientId nulo — a FK só vale quando o par está preenchido.

CREATE UNIQUE INDEX "Client_id_organizationId_key" ON "Client"("id", "organizationId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Lead" VALIDATE CONSTRAINT "Lead_client_org_fkey";

ALTER TABLE "Patient" ADD CONSTRAINT "Patient_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Patient" VALIDATE CONSTRAINT "Patient_client_org_fkey";

ALTER TABLE "Procedure" ADD CONSTRAINT "Procedure_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Procedure" VALIDATE CONSTRAINT "Procedure_client_org_fkey";

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Appointment" VALIDATE CONSTRAINT "Appointment_client_org_fkey";

ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Revenue" VALIDATE CONSTRAINT "Revenue_client_org_fkey";

ALTER TABLE "Cost" ADD CONSTRAINT "Cost_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Cost" VALIDATE CONSTRAINT "Cost_client_org_fkey";

ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Receivable" VALIDATE CONSTRAINT "Receivable_client_org_fkey";

ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "FixedAsset" VALIDATE CONSTRAINT "FixedAsset_client_org_fkey";

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Goal" VALIDATE CONSTRAINT "Goal_client_org_fkey";

ALTER TABLE "Insight" ADD CONSTRAINT "Insight_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Insight" VALIDATE CONSTRAINT "Insight_client_org_fkey";

ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "KpiSnapshot" VALIDATE CONSTRAINT "KpiSnapshot_client_org_fkey";

ALTER TABLE "PipelineDeal" ADD CONSTRAINT "PipelineDeal_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "PipelineDeal" VALIDATE CONSTRAINT "PipelineDeal_client_org_fkey";

ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Pipeline" VALIDATE CONSTRAINT "Pipeline_client_org_fkey";

ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "MessageTemplate" VALIDATE CONSTRAINT "MessageTemplate_client_org_fkey";

ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "OutboundMessage" VALIDATE CONSTRAINT "OutboundMessage_client_org_fkey";

ALTER TABLE "ClinicActivityType" ADD CONSTRAINT "ClinicActivityType_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "ClinicActivityType" VALIDATE CONSTRAINT "ClinicActivityType_client_org_fkey";

ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "ClientNote" VALIDATE CONSTRAINT "ClientNote_client_org_fkey";

ALTER TABLE "Document" ADD CONSTRAINT "Document_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_client_org_fkey";

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "Activity" VALIDATE CONSTRAINT "Activity_client_org_fkey";

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_client_org_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "Client"("id", "organizationId") NOT VALID;
ALTER TABLE "CalendarEvent" VALIDATE CONSTRAINT "CalendarEvent_client_org_fkey";
