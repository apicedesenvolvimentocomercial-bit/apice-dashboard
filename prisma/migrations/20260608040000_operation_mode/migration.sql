-- Modo de operação por clínica (reforma da retenção — retencao-reforma-progresso.md).
-- MANUAL (default) = os toques da régua de retenção viram ATIVIDADE atrelada ao
-- paciente; AUTOMATED = a régua envia mensagem (de fato só quando o WhatsApp estiver
-- integrado). Futuro: vira plano de pagamento.
CREATE TYPE "OperationMode" AS ENUM ('MANUAL', 'AUTOMATED');

ALTER TABLE "Client" ADD COLUMN "operationMode" "OperationMode" NOT NULL DEFAULT 'MANUAL';

-- Marca de "toque virou tarefa" no ledger OutboundMessage (modo MANUAL). Não é usado
-- nesta migration (só em runtime), então o ADD VALUE numa tx separada do uso é seguro.
ALTER TYPE "OutboundMessageStatus" ADD VALUE IF NOT EXISTS 'TASK';
