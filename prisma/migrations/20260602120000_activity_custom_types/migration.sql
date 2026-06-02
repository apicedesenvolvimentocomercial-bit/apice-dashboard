-- Tipos de tarefa: MESSAGE nativo + tipos PERSONALIZADOS por clínica.
-- Built-ins (enum) mantêm integrações; custom = label por clínica, Activity.type=TASK.

-- 1) Tipo nativo "Mensagem"
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'MESSAGE';

-- 2) Tabela de tipos personalizados por clínica
CREATE TABLE IF NOT EXISTS "ClinicActivityType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicActivityType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicActivityType_clientId_label_key" ON "ClinicActivityType"("clientId", "label");
CREATE INDEX IF NOT EXISTS "ClinicActivityType_clientId_idx" ON "ClinicActivityType"("clientId");
ALTER TABLE "ClinicActivityType" ADD CONSTRAINT "ClinicActivityType_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Vínculo opcional da atividade ao tipo personalizado
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "customTypeId" TEXT;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_customTypeId_fkey" FOREIGN KEY ("customTypeId") REFERENCES "ClinicActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) RLS p/ a tabela nova com clientId (obrigatório — ver rls-gambiarra.md).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['ClinicActivityType'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      'USING (NULLIF(current_setting(''app.current_client_id'', true), '''') IS NULL '
      'OR "clientId" = current_setting(''app.current_client_id'', true)) '
      'WITH CHECK (NULLIF(current_setting(''app.current_client_id'', true), '''') IS NULL '
      'OR "clientId" = current_setting(''app.current_client_id'', true))',
      t
    );
  END LOOP;
END $$;
