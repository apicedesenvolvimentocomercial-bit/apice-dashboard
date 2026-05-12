import { describe, expect, it } from 'vitest'

import { calculateCommercialKpis } from './commercial'

describe('calculateCommercialKpis', () => {
  it('retorna null para taxas quando denominador é zero', () => {
    const out = calculateCommercialKpis({
      leadsCount: 0,
      wonCount: 0,
      appointmentsCount: 0,
      attendedCount: 0,
      noShowCount: 0,
      avgTimeToFirstContactMin: null,
    })
    expect(out.conversionRate).toBeNull()
    expect(out.noShowRate).toBeNull()
    expect(out.attendanceRate).toBeNull()
  })

  it('calcula conversão como wonCount/leadsCount', () => {
    const out = calculateCommercialKpis({
      leadsCount: 100,
      wonCount: 22,
      appointmentsCount: 40,
      attendedCount: 30,
      noShowCount: 10,
      avgTimeToFirstContactMin: 45,
    })
    expect(out.conversionRate).toBeCloseTo(0.22, 5)
    expect(out.noShowRate).toBeCloseTo(0.25, 5)
    expect(out.attendanceRate).toBeCloseTo(0.75, 5)
    expect(out.avgTimeToFirstContactMin).toBe(45)
  })

  it('preserva contagens absolutas', () => {
    const out = calculateCommercialKpis({
      leadsCount: 50,
      wonCount: 5,
      appointmentsCount: 25,
      attendedCount: 20,
      noShowCount: 3,
      avgTimeToFirstContactMin: 0,
    })
    expect(out.leadsCount).toBe(50)
    expect(out.appointmentsCount).toBe(25)
    expect(out.attendedCount).toBe(20)
    expect(out.noShowCount).toBe(3)
  })
})
