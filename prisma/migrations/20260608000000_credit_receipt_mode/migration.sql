-- Modelo de recebimento no cartão de crédito (parcelado vs antecipado c/ taxa).
-- Default INSTALLMENTS preserva o comportamento histórico. `creditFeeTiers` guarda
-- a taxa de antecipação por faixa de parcelas (modo UPFRONT_FEE). Client é a raiz do
-- tenant (sem clientId próprio) → não entra na RLS.
CREATE TYPE "CreditReceiptMode" AS ENUM ('INSTALLMENTS', 'UPFRONT_FEE');

ALTER TABLE "Client"
  ADD COLUMN "creditReceiptMode" "CreditReceiptMode" NOT NULL DEFAULT 'INSTALLMENTS',
  ADD COLUMN "creditFeeTiers" JSONB;
