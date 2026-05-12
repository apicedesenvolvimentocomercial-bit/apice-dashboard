import { describe, expect, it } from 'vitest'

import { spDate } from '@/lib/date'
import { previousPeriod, resolvePeriod } from './period'

describe('resolvePeriod', () => {
  const ref = spDate(2025, 4, 15, 12, 0, 0) // 15/mai/2025 (uma quinta-feira)

  it('mês: do dia 1 ao último ms do mês', () => {
    const r = resolvePeriod('month', ref)
    expect(r.key).toBe('month')
    expect(r.from.getTime()).toBe(spDate(2025, 4, 1).getTime())
    expect(r.to.getTime()).toBe(spDate(2025, 5, 1).getTime() - 1)
  })

  it('dia: 24h do dia da referência', () => {
    const r = resolvePeriod('day', ref)
    expect(r.key).toBe('day')
    expect(r.to.getTime() - r.from.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('trimestre: cobre 3 meses', () => {
    const r = resolvePeriod('quarter', ref)
    expect(r.key).toBe('quarter')
    expect(r.from.getTime()).toBe(spDate(2025, 3, 1).getTime()) // abril
    expect(r.to.getTime()).toBe(spDate(2025, 6, 1).getTime() - 1) // último ms de junho
  })

  it('custom válido respeita as datas fornecidas', () => {
    const r = resolvePeriod('custom', ref, { from: '2025-01-10', to: '2025-01-20' })
    expect(r.key).toBe('custom')
    expect(r.from.getTime()).toBe(spDate(2025, 0, 10).getTime())
    expect(r.to.getTime()).toBe(spDate(2025, 0, 21).getTime() - 1)
  })

  it('custom inválido cai no default (mês)', () => {
    const r = resolvePeriod('custom', ref, { from: 'invalid', to: 'invalid' })
    expect(r.key).toBe('month')
  })
})

describe('previousPeriod', () => {
  it('produz um período de tamanho igual imediatamente antes', () => {
    const range = resolvePeriod('month', spDate(2025, 4, 15, 12, 0, 0))
    const prev = previousPeriod(range)
    expect(prev.to.getTime()).toBe(range.from.getTime() - 1)
    const curSpan = range.to.getTime() - range.from.getTime()
    const prevSpan = prev.to.getTime() - prev.from.getTime()
    expect(prevSpan).toBe(curSpan)
  })
})
