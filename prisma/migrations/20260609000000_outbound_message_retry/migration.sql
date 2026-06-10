-- Fila de mensagens com claim atômico + retry (plano de correções 1.2).
-- SENDING marca a mensagem CLAIMED por uma execução do dispatcher; attempts/
-- nextAttemptAt dirigem o backoff exponencial; FAILED vira terminal só após
-- esgotar as tentativas.

-- PG12+: ADD VALUE pode rodar dentro da transação da migration desde que o novo
-- valor não seja USADO na mesma transação (não é — nenhum write aqui).
ALTER TYPE "OutboundMessageStatus" ADD VALUE 'SENDING';

ALTER TABLE "OutboundMessage" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboundMessage" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

-- Dispatcher cross-clínica varre por status+scheduledFor (sem clientId).
CREATE INDEX "OutboundMessage_status_scheduledFor_idx"
  ON "OutboundMessage"("status", "scheduledFor");
