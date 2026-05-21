-- Reforma "divisão total" — discriminador de domínio em Activity (Fase 3).
-- ADITIVA: novo enum + coluna NOT NULL DEFAULT 'ADMIN'. Postgres preenche as
-- linhas existentes com 'ADMIN' sem rewrite (toda atividade atual é da agência).
-- Atividade de clínica passa a gravar 'CLINIC' → painel admin e clínica nunca
-- se misturam, mesmo compartilhando a tabela e o clientId (que no admin é só
-- etiqueta de CRM).

CREATE TYPE "ActivityDomain" AS ENUM ('ADMIN', 'CLINIC');

ALTER TABLE "Activity" ADD COLUMN "domain" "ActivityDomain" NOT NULL DEFAULT 'ADMIN';
