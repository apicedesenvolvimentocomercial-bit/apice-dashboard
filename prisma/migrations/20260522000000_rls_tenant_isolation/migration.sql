-- Fase 11 — RLS (Row Level Security) como defesa em profundidade no banco.
-- Ver `prompt/rls-gambiarra.md` para o desenho completo e os footguns.
--
-- Modelo: cada tabela com `clientId` ganha uma policy `tenant_isolation`. O app
-- injeta a GUC `app.current_client_id` por request (só no contexto de CLÍNICA,
-- via extensão do Prisma). A policy:
--   • GUC nula (contexto admin) ⇒ libera tudo (admin vê todas as clínicas).
--   • GUC setada (contexto clínica) ⇒ só linhas daquela clínica.
--
-- FORCE RLS faz a policy valer ATÉ para o dono da tabela (o role que o Prisma
-- usa) — sem isso o dono burlaria a RLS. Não vale para superuser/BYPASSRLS;
-- garanta em prod que o role de conexão não tem esses atributos.
--
-- `User` é DELIBERADAMENTE excluída: a query de login (NextAuth `authorize`)
-- roda sem GUC e não pode ser filtrada por clínica.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Patient', 'Appointment', 'Procedure', 'ProcedureCategory',
    'Lead', 'Revenue', 'Cost', 'Goal', 'Insight',
    'Activity', 'CalendarEvent', 'Notification',
    'PipelineDeal', 'PipelineStage', 'MarketingCampaign',
    'KpiSnapshot', 'ClinicHoliday', 'Invitation'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- NULLIF(..., '') trata GUC vazia como "sem escopo" (admin). Após um
    -- `set_config(local=true)` a GUC custom reverte para '' (não NULL) na mesma
    -- conexão; sem o NULLIF um request admin reusando essa conexão veria zero
    -- linhas. Ver `prompt/rls-gambiarra.md`.
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
