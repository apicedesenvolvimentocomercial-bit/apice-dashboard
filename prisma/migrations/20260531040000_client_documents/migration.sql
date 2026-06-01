-- Item 6c: documentos/arquivos do card do cliente. Só metadados aqui; o binário
-- vive num bucket PRIVADO do Supabase Storage (acesso por URL assinada).

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "leadId" TEXT,
    "patientId" TEXT,
    "uploaderId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_clientId_leadId_idx" ON "Document"("clientId", "leadId");

-- CreateIndex
CREATE INDEX "Document_clientId_patientId_idx" ON "Document"("clientId", "patientId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (mesma policy tenant_isolation). Grants ao role da app por ALTER DEFAULT
-- PRIVILEGES (tabela criada pelo owner) — ver prisma/rls-setup-role.ts.
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Document";
CREATE POLICY tenant_isolation ON "Document" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL OR "clientId" = current_setting('app.current_client_id', true));
