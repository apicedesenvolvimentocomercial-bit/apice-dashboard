import { describe, expect, it } from 'vitest'

import {
  computeCreditFee,
  feePctForInstallments,
  isCreditUpfront,
  parseCreditFeeTiers,
  type CreditReceiptConfig,
} from './credit-fee'

const TIERS = [
  { min: 1, max: 1, pct: 2 },
  { min: 2, max: 6, pct: 4.5 },
  { min: 7, max: 12, pct: 6.8 },
]
const UPFRONT: CreditReceiptConfig = { mode: 'UPFRONT_FEE', tiers: TIERS }
const INSTALLMENTS: CreditReceiptConfig = { mode: 'INSTALLMENTS', tiers: TIERS }

describe('parseCreditFeeTiers', () => {
  it('mantém faixas válidas e ordena por min', () => {
    const out = parseCreditFeeTiers([
      { min: 7, max: 12, pct: 6.8 },
      { min: 1, max: 1, pct: 2 },
    ])
    expect(out).toEqual([
      { min: 1, max: 1, pct: 2 },
      { min: 7, max: 12, pct: 6.8 },
    ])
  })

  it('descarta lixo (não-array, campos faltando, min<1, max<min, pct<0)', () => {
    expect(parseCreditFeeTiers(null)).toEqual([])
    expect(parseCreditFeeTiers('x')).toEqual([])
    expect(
      parseCreditFeeTiers([
        { min: 0, max: 3, pct: 2 },
        { min: 5, max: 2, pct: 2 },
        { min: 1, max: 1, pct: -1 },
        { min: 2, max: 4 },
      ])
    ).toEqual([])
  })
})

describe('feePctForInstallments', () => {
  it('escolhe a faixa que contém n', () => {
    expect(feePctForInstallments(TIERS, 1)).toBe(2)
    expect(feePctForInstallments(TIERS, 3)).toBe(4.5)
    expect(feePctForInstallments(TIERS, 12)).toBe(6.8)
  })
  it('0 fora de qualquer faixa', () => {
    expect(feePctForInstallments(TIERS, 24)).toBe(0)
    expect(feePctForInstallments([], 3)).toBe(0)
  })
})

describe('isCreditUpfront', () => {
  it('só crédito + UPFRONT_FEE', () => {
    expect(isCreditUpfront(UPFRONT, 'CREDIT_CARD')).toBe(true)
    expect(isCreditUpfront(UPFRONT, 'DEBIT_CARD')).toBe(false)
    expect(isCreditUpfront(UPFRONT, 'PIX')).toBe(false)
    expect(isCreditUpfront(INSTALLMENTS, 'CREDIT_CARD')).toBe(false)
    expect(isCreditUpfront(undefined, 'CREDIT_CARD')).toBe(false)
  })
})

describe('computeCreditFee', () => {
  it('aplica a taxa da faixa sobre o valor (crédito + UPFRONT_FEE)', () => {
    expect(computeCreditFee(UPFRONT, 'CREDIT_CARD', 1000, 6)).toBe(45) // 4,5%
    expect(computeCreditFee(UPFRONT, 'CREDIT_CARD', 1000, 1)).toBe(20) // 2%
    expect(computeCreditFee(UPFRONT, 'CREDIT_CARD', 999.9, 12)).toBe(67.99) // 6,8%, arredonda
  })
  it('0 quando não se aplica (modo parcelado, outra forma, fora de faixa)', () => {
    expect(computeCreditFee(INSTALLMENTS, 'CREDIT_CARD', 1000, 6)).toBe(0)
    expect(computeCreditFee(UPFRONT, 'PIX', 1000, 6)).toBe(0)
    expect(computeCreditFee(UPFRONT, 'CREDIT_CARD', 1000, 24)).toBe(0)
  })
})
