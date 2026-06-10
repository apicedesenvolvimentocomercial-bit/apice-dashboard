/**
 * Dinheiro em CENTAVOS INTEIROS (decisão K2 do plano de correções).
 *
 * Regra: valores monetários trafegam como `number` em reais nas bordas (DB
 * Decimal → Number, UI), mas TODA aritmética encadeada (somas de linhas de DRE,
 * acumulações de buckets) acontece em centavos inteiros — float não deriva em
 * inteiros até 2^53. Padrão já usado por `splitAmount` (revenue-repository).
 */

/** Reais (float de 2 casas) → centavos inteiros. */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/** Centavos inteiros → reais (exato: divisão por 100 de inteiro). */
export function fromCents(cents: number): number {
  return cents / 100
}
