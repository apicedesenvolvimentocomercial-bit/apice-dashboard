/**
 * Taxa de antecipação do cartão de crédito (modo `UPFRONT_FEE`). PURO — sem Prisma,
 * sem React. Usado pelo repo de receita e pelos serviços (agenda/pipeline) p/ decidir
 * o cronograma de recebimento e a despesa financeira da taxa. Ver dre-progresso.md.
 *
 * Regra: só vale para `paymentMethod === 'CREDIT_CARD'` e modo `UPFRONT_FEE`. Aí a
 * venda é recebida À VISTA (1 parcela PAGA) e a taxa vira um Cost FINANCIAL_EXPENSE.
 * A % sai da FAIXA de nº de parcelas (`tiers`); fora de qualquer faixa = 0% (seguro).
 */

export type CreditReceiptMode = 'INSTALLMENTS' | 'UPFRONT_FEE'

/** Faixa de taxa: parcelas de `min` a `max` (inclusive) → `pct` por cento. */
export type CreditFeeTier = { min: number; max: number; pct: number }

export type CreditReceiptConfig = {
  mode: CreditReceiptMode
  tiers: CreditFeeTier[]
}

/** Forma de pagamento que dispara o modelo de antecipação (só crédito). */
export const CREDIT_CARD_METHOD = 'CREDIT_CARD'

/** Categoria do Cost gerado pela taxa de antecipação (identifica p/ re-sync na edição). */
export const CREDIT_FEE_CATEGORY = 'Taxa de cartão (antecipação)'

export const DEFAULT_CREDIT_CONFIG: CreditReceiptConfig = { mode: 'INSTALLMENTS', tiers: [] }

/** Valida/normaliza o JSON cru de `Client.creditFeeTiers` numa lista de faixas. */
export function parseCreditFeeTiers(raw: unknown): CreditFeeTier[] {
  if (!Array.isArray(raw)) return []
  const tiers: CreditFeeTier[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const min = Number((t as Record<string, unknown>).min)
    const max = Number((t as Record<string, unknown>).max)
    const pct = Number((t as Record<string, unknown>).pct)
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(pct)) continue
    if (min < 1 || max < min || pct < 0) continue
    tiers.push({ min: Math.round(min), max: Math.round(max), pct })
  }
  return tiers.sort((a, b) => a.min - b.min)
}

/** % da faixa que contém `n` parcelas; 0 se nenhuma faixa cobre. */
export function feePctForInstallments(tiers: CreditFeeTier[], n: number): number {
  const tier = tiers.find((t) => n >= t.min && n <= t.max)
  return tier ? tier.pct : 0
}

/** A venda é recebida à vista com taxa? (crédito + modo UPFRONT_FEE). */
export function isCreditUpfront(
  config: CreditReceiptConfig | undefined,
  paymentMethod: string | null | undefined
): boolean {
  return !!config && config.mode === 'UPFRONT_FEE' && paymentMethod === CREDIT_CARD_METHOD
}

/** Taxa de antecipação em R$ (0 se o modelo não se aplica). Arredonda a 2 casas. */
export function computeCreditFee(
  config: CreditReceiptConfig | undefined,
  paymentMethod: string | null | undefined,
  amount: number,
  installments: number | null | undefined
): number {
  if (!isCreditUpfront(config, paymentMethod)) return 0
  const n = Math.max(1, installments ?? 1)
  const pct = feePctForInstallments(config!.tiers, n)
  return Math.round(amount * (pct / 100) * 100) / 100
}
