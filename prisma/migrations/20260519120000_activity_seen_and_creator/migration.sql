-- Coluna para marcar quando o responsável visualizou a atividade pela
-- primeira vez. Activities ainda não vistas exibem o badge "Nova".
ALTER TABLE "Activity" ADD COLUMN "seenByAssigneeAt" TIMESTAMP(3);

-- Backfill: marcamos as atividades existentes como já vistas (o autor de cada
-- uma é o próprio responsável na maioria dos casos, então não faz sentido
-- mostrar Nova para todas elas retroativamente).
UPDATE "Activity" SET "seenByAssigneeAt" = "createdAt" WHERE "seenByAssigneeAt" IS NULL;

-- FK para o criador (createdById já existia como coluna solta).
ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
