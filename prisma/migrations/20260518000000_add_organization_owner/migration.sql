-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "ownerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ownerId_key" ON "Organization"("ownerId");

-- AddForeignKey
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Backfill: para cada organização sem dono, escolhe o ADMIN ativo mais antigo
-- como titular inicial. Organizações sem nenhum ADMIN ficam com ownerId NULL
-- e a UI permite que o primeiro ADMIN que entrar assuma a titularidade.
UPDATE "Organization" AS o
SET "ownerId" = sub.user_id
FROM (
  SELECT DISTINCT ON (u."organizationId")
    u."organizationId" AS org_id,
    u.id AS user_id
  FROM "User" u
  WHERE u.role = 'ADMIN'
    AND u."deletedAt" IS NULL
    AND u."organizationId" IS NOT NULL
  ORDER BY u."organizationId", u."createdAt" ASC
) AS sub
WHERE o.id = sub.org_id
  AND o."ownerId" IS NULL;
