-- Etapa 1 — Cargos configuráveis + titularidade da clínica.
-- Ver `prompt/cargos-progresso.md` para o desenho completo.
--
-- 1) Client.ownerId (titular/coroa da clínica) — espelha Organization.ownerId.
-- 2) User.clinicRoleId (cargo configurável; null = fallback ROLE_DEFAULTS).
-- 3) Tabela ClinicRole (cargo por clínica com permissões JSON por aba).
-- 4) RLS: ClinicRole tem clientId ⇒ ganha a policy tenant_isolation como as
--    demais tabelas de clínica (Fase 11). Sem isso o contexto de clínica não
--    conseguiria ler/escrever seus cargos.

-- =========================================================================
-- 1. Client.ownerId
-- =========================================================================
ALTER TABLE "Client" ADD COLUMN "ownerId" TEXT;

CREATE UNIQUE INDEX "Client_ownerId_key" ON "Client"("ownerId");

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Backfill: para cada clínica sem titular, escolhe o CLIENT_OWNER ativo mais
-- antigo como titular inicial (o criador). Clínicas sem nenhum CLIENT_OWNER
-- ficam com ownerId NULL; o primeiro CLIENT_OWNER que entrar assume a coroa.
UPDATE "Client" AS c
SET "ownerId" = sub.user_id
FROM (
  SELECT DISTINCT ON (u."clientId")
    u."clientId" AS client_id,
    u.id AS user_id
  FROM "User" u
  WHERE u.role = 'CLIENT_OWNER'
    AND u."deletedAt" IS NULL
    AND u."clientId" IS NOT NULL
  ORDER BY u."clientId", u."createdAt" ASC
) AS sub
WHERE c.id = sub.client_id
  AND c."ownerId" IS NULL;

-- =========================================================================
-- 2. Tabela ClinicRole
-- =========================================================================
CREATE TABLE "ClinicRole" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "permissions"    JSONB NOT NULL,
  "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
  "isSystem"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicRole_clientId_name_key" ON "ClinicRole"("clientId", "name");
CREATE INDEX "ClinicRole_clientId_idx" ON "ClinicRole"("clientId");

ALTER TABLE "ClinicRole"
  ADD CONSTRAINT "ClinicRole_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- =========================================================================
-- 3. User.clinicRoleId
-- =========================================================================
ALTER TABLE "User" ADD COLUMN "clinicRoleId" TEXT;

CREATE INDEX "User_clinicRoleId_idx" ON "User"("clinicRoleId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_clinicRoleId_fkey"
  FOREIGN KEY ("clinicRoleId") REFERENCES "ClinicRole"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- =========================================================================
-- 4. RLS para ClinicRole (mesma policy tenant_isolation das tabelas de clínica)
-- =========================================================================
ALTER TABLE "ClinicRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicRole" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClinicRole";
CREATE POLICY tenant_isolation ON "ClinicRole" FOR ALL
  USING (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
         OR "clientId" = current_setting('app.current_client_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_client_id', true), '') IS NULL
              OR "clientId" = current_setting('app.current_client_id', true));
