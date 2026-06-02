-- Pendências de segurança (ledger seguranca-pendencias.md) + polish DRE.
-- 1) RateLimit: contador de janela fixa p/ brute-force de login + flooding de webhook.
-- 2) Client.webhookTokenHash: token de webhook por-clínica (resolve clientId server-side).
-- 3) Receivable.writtenOffAt: data dedicada da baixa por perda (inadimplência na DRE).
-- IF NOT EXISTS: idempotente (recupera-se de estado parcial no DB de teste; inócuo em prod).

-- 1) RateLimit (tabela global — sem clientId, fora da RLS)
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- 2) Token de webhook por-clínica (hash sha256; único)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "webhookTokenHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_webhookTokenHash_key" ON "Client"("webhookTokenHash");

-- 3) Data dedicada da baixa por perda
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "writtenOffAt" TIMESTAMP(3);
