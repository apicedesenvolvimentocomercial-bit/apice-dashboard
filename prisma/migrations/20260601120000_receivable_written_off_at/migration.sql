-- Receivable.writtenOffAt: data dedicada da baixa por perda (write-off). A DRE
-- atribui a inadimplência ao período por este campo (não mais por `updatedAt`).
-- Ver prompt/dre-progresso.md. RateLimit + Client.webhookTokenHash vêm da migration
-- 20260601000000_security_rate_limit_webhook_token (seguranca #1/#2).
ALTER TABLE "Receivable" ADD COLUMN "writtenOffAt" TIMESTAMP(3);
