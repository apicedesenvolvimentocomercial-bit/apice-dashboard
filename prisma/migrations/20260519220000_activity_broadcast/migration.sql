-- Cada fan-out "Todos" gera N atividades compartilhando o mesmo broadcastId.
-- O admin colapsa em uma única linha (mostra só a cópia dele) na pasta Todos.
ALTER TABLE "Activity" ADD COLUMN "broadcastId" TEXT;

CREATE INDEX "Activity_broadcastId_idx" ON "Activity"("broadcastId");
