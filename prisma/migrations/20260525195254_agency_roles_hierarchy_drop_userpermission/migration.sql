-- Cargos de agência (AgencyRole) + hierarquia linear (level) + remoção do
-- sistema legado UserPermission. Ver prompt/agency-roles-progresso.md.
-- Pré-MVP: prod só tem seed → drop destrutivo sem backfill de dados reais.

-- 1. Remove o sistema legado UserPermission --------------------------------
DROP TABLE "UserPermission";

-- 2. AgencyRole (espelho de ClinicRole, escopo organizationId) -------------
CREATE TABLE "AgencyRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyRole_organizationId_name_key" ON "AgencyRole"("organizationId", "name");
CREATE UNIQUE INDEX "AgencyRole_organizationId_level_key" ON "AgencyRole"("organizationId", "level");
CREATE INDEX "AgencyRole_organizationId_idx" ON "AgencyRole"("organizationId");

ALTER TABLE "AgencyRole"
  ADD CONSTRAINT "AgencyRole_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. User.agencyRoleId ------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "agencyRoleId" TEXT;
CREATE INDEX "User_agencyRoleId_idx" ON "User"("agencyRoleId");
ALTER TABLE "User"
  ADD CONSTRAINT "User_agencyRoleId_fkey"
  FOREIGN KEY ("agencyRoleId") REFERENCES "AgencyRole"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Hierarquia linear no ClinicRole ---------------------------------------
-- Adiciona level sem default-fixo colidir no unique: cria nullable, numera
-- sequencialmente por clínica (isSystem "Titular" = 0), depois trava NOT NULL
-- + default + unique.
ALTER TABLE "ClinicRole" ADD COLUMN "level" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "clientId"
      ORDER BY "isSystem" DESC, "createdAt" ASC
    ) - 1 AS rn
  FROM "ClinicRole"
)
UPDATE "ClinicRole" c
SET "level" = ranked.rn
FROM ranked
WHERE c."id" = ranked."id";

ALTER TABLE "ClinicRole" ALTER COLUMN "level" SET NOT NULL;
ALTER TABLE "ClinicRole" ALTER COLUMN "level" SET DEFAULT 0;
CREATE UNIQUE INDEX "ClinicRole_clientId_level_key" ON "ClinicRole"("clientId", "level");
