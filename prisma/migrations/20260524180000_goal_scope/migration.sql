-- Etapa 2 — Metas por usuário/cargo (escopo).
-- Goal ganha scopeType (CLINIC/USER/ROLE), mode (INDIVIDUAL/SHARED) e os alvos
-- assigneeUserId / assigneeRoleId. Metas existentes viram CLINIC + SHARED
-- (defaults), preservando o comportamento coletivo atual.

-- 1. Enums
CREATE TYPE "GoalScopeType" AS ENUM ('CLINIC', 'USER', 'ROLE');
CREATE TYPE "GoalMode" AS ENUM ('INDIVIDUAL', 'SHARED');

-- 2. Colunas (com defaults p/ backfill implícito das metas existentes)
ALTER TABLE "Goal"
  ADD COLUMN "scopeType"      "GoalScopeType" NOT NULL DEFAULT 'CLINIC',
  ADD COLUMN "mode"           "GoalMode"      NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "assigneeUserId" TEXT,
  ADD COLUMN "assigneeRoleId" TEXT;

-- 3. FKs (onDelete CASCADE: se o usuário/cargo some, a meta dele some junto)
ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_assigneeRoleId_fkey"
  FOREIGN KEY ("assigneeRoleId") REFERENCES "ClinicRole"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Índices p/ filtrar metas por alvo
CREATE INDEX "Goal_clientId_assigneeUserId_idx" ON "Goal"("clientId", "assigneeUserId");
CREATE INDEX "Goal_clientId_assigneeRoleId_idx" ON "Goal"("clientId", "assigneeRoleId");
