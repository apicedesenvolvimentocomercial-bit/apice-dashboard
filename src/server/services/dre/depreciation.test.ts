import { describe, expect, it } from 'vitest'

import { depreciationForPeriod, type AssetForDepreciation } from './depreciation'

const tangible = (over: Partial<AssetForDepreciation> = {}): AssetForDepreciation => ({
  kind: 'TANGIVEL',
  acquisitionValue: 12000,
  residualValue: 0,
  acquisitionDate: new Date('2026-01-10'),
  usefulLifeMonths: 12,
  disposedAt: null,
  ...over,
})

describe('depreciationForPeriod', () => {
  it('linear: 1 mês = cota mensal', () => {
    const r = depreciationForPeriod([tangible()], {
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
    })
    expect(r.depreciacao).toBe(1000) // 12000 / 12
    expect(r.amortizacao).toBe(0)
  })

  it('ano cheio dentro da vida útil = valor depreciável total', () => {
    const r = depreciationForPeriod([tangible()], {
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
    })
    expect(r.depreciacao).toBe(12000)
  })

  it('depois da vida útil = 0', () => {
    const r = depreciationForPeriod([tangible()], {
      from: new Date('2027-06-01'),
      to: new Date('2027-06-30'),
    })
    expect(r.depreciacao).toBe(0)
  })

  it('valor residual reduz a base depreciável', () => {
    const r = depreciationForPeriod([tangible({ residualValue: 2400 })], {
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
    })
    expect(r.depreciacao).toBe(800) // (12000 - 2400) / 12
  })

  it('baixa (disposedAt) interrompe a depreciação', () => {
    // 12 meses de vida; baixado em mar/2026 → só jan+fev contam no ano.
    const r = depreciationForPeriod([tangible({ disposedAt: new Date('2026-03-15') })], {
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
    })
    expect(r.depreciacao).toBe(2000)
  })

  it('intangível vai para amortização', () => {
    const r = depreciationForPeriod(
      [tangible({ kind: 'INTANGIVEL', acquisitionValue: 6000, usefulLifeMonths: 6 })],
      { from: new Date('2026-01-01'), to: new Date('2026-01-31') }
    )
    expect(r.depreciacao).toBe(0)
    expect(r.amortizacao).toBe(1000)
  })
})
