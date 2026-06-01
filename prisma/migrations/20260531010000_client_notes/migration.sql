-- Item 6: anotações livres do card do cliente (lead/paciente).

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "leadId" TEXT,
    "patientId" TEXT,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientNote_clientId_leadId_idx" ON "ClientNote"("clientId", "leadId");

-- CreateIndex
CREATE INDEX "ClientNote_clientId_patientId_idx" ON "ClientNote"("clientId", "patientId");

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (defesa em profundidade): mesma policy tenant_isolation das demais tabelas
-- com clientId. GUC nula = contexto admin (libera tudo); setada = só a clínica.
-- O role da app (NOBYPASSRLS) herda o SELECT/INSERT/UPDATE/DELETE por ALTER
-- DEFAULT PRIVILEGES (tabela criada pelo owner) — ver prisma/rls-setup-role.ts.
ALTER TABLE "ClientNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientNote" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClientNote";
CREATE POLICY tenant_isolation ON "ClientNote" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true));
