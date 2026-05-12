import { describe, expect, it } from 'vitest'

import { calculateFinancialKpis, calculateMoMGrowth } from './financial'

describe('calculateFinancialKpis', () => {
  it('retorna null em margens, ticket, ROI e CAC quando denominador zero', () => {
    const out = calculateFinancialKpis({
      revenueTotal: 0,
      costTotalAll: 0,
      costMarketing: 0,
      costVariable: 0,
      revenueCount: 0,
      newPatientsCount: 0,
      revenueAttributedToMarketing: 0,
    })
    expect(out.grossMargin).toBeNull()
    expect(out.netMargin).toBeNull()
    expect(out.averageTicket).toBeNull()
    expect(out.roi).toBeNull()
    expect(out.cac).toBeNull()
  })

  it('calcula margens corretamente quando há receita e custos', () => {
    const out = calculateFinancialKpis({
      revenueTotal: 10000,
      costTotalAll: 6000, // FIXED=2000, VARIABLE=2000, MARKETING=2000
      costMarketing: 2000,
      costVariable: 2000,
      revenueCount: 50,
      newPatientsCount: 10,
      revenueAttributedToMarketing: 4000,
    })
    // gross margin = (10000 - (2000 marketing + 2000 variable)) / 10000 = 0.6
    expect(out.grossMargin).toBeCloseTo(0.6, 5)
    // net = (10000 - 6000) / 10000 = 0.4
    expect(out.netMargin).toBeCloseTo(0.4, 5)
    expect(out.averageTicket).toBeCloseTo(200, 5)
    // ROI = (4000 - 2000) / 2000 = 1
    expect(out.roi).toBeCloseTo(1, 5)
    // CAC = 2000 / 10 = 200
    expect(out.cac).toBeCloseTo(200, 5)
    expect(out.totalRevenue).toBe(10000)
    expect(out.netProfit).toBe(4000)
  })

  it('calcula receita perdida usando ticket médio quando não passado contexto', () => {
    const out = calculateFinancialKpis(
      {
        revenueTotal: 5000,
        costTotalAll: 1000,
        costMarketing: 200,
        costVariable: 0,
        revenueCount: 25,
        newPatientsCount: 5,
        revenueAttributedToMarketing: 1000,
      },
      { noShowCount: 4 }
    )
    expect(out.averageTicket).toBeCloseTo(200, 5)
    // 4 no-shows × 200 = 800
    expect(out.estimatedLostRevenue).toBeCloseTo(800, 5)
  })
})

describe('calculateMoMGrowth', () => {
  it('retorna null quando o mês anterior é zero', () => {
    expect(calculateMoMGrowth(1000, 0)).toBeNull()
  })

  it('calcula crescimento positivo', () => {
    expect(calculateMoMGrowth(1200, 1000)).toBeCloseTo(0.2, 5)
  })

  it('calcula crescimento negativo', () => {
    expect(calculateMoMGrowth(800, 1000)).toBeCloseTo(-0.2, 5)
  })
})
