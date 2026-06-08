-- Reforma da retenção (retencao-reforma-progresso.md), parte 1/2: só ADIciona os
-- valores ao enum StageNativeKey. SEPARADA do backfill de propósito — no Postgres
-- um valor novo de enum (ALTER TYPE ... ADD VALUE) NÃO pode ser USADO na mesma
-- transação em que foi adicionado. A migration 2 (..._retention_lifecycle), por
-- rodar numa transação posterior, já pode referenciar estes valores no backfill.
ALTER TYPE "StageNativeKey" ADD VALUE IF NOT EXISTS 'POST_CARE';
ALTER TYPE "StageNativeKey" ADD VALUE IF NOT EXISTS 'NURTURE';
ALTER TYPE "StageNativeKey" ADD VALUE IF NOT EXISTS 'REACTIVATION';
ALTER TYPE "StageNativeKey" ADD VALUE IF NOT EXISTS 'LOYALTY';
ALTER TYPE "StageNativeKey" ADD VALUE IF NOT EXISTS 'WINBACK';
