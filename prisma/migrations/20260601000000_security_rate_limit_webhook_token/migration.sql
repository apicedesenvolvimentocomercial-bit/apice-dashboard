-- seguranca-pendencias #1 + #2 — hardening OBRIGATÓRIO antes das integrações reais.

-- #1 Rate-limit: contador fixed-window persistido. Infra GLOBAL (sem clientId) →
-- FICA FORA DA RLS de propósito: login (NextAuth authorize) e webhook rodam sem
-- escopo de clínica e precisam escrever aqui.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- Grant explícito ao role restrito da app (belt — além do ALTER DEFAULT PRIVILEGES
-- de prisma/rls-setup-role.ts). O LOGIN depende desta tabela, então garantimos o
-- acesso de forma idempotente. Guard: no-op se o role não existir (ambientes onde
-- a app conecta como owner — local/Prisma Postgres dev).
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "RateLimit" TO app_user;
  END IF;
END $$;

-- #2 Token de webhook POR-CLÍNICA (sha256 hex). O token resolve o clientId
-- server-side no webhook; o body não decide mais a clínica (isola cross-tenant).
ALTER TABLE "Client" ADD COLUMN "webhookTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_webhookTokenHash_key" ON "Client"("webhookTokenHash");
