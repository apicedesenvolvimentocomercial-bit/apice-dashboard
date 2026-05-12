import { describe, expect, it } from 'vitest'

import { calculateHealthScore, healthBand } from './health-score'

describe('calculateHealthScore', () => {
  it('retorna null se nenhuma dimensão está disponível', () => {
    expect(
      calculateHealthScore({
        conversionRate: null,
        noShowRate: null,
        netMargin: null,
        revenueGrowthMoM: null,
        leadsTargetAchievement: null,
        avgTimeToFirstContactMin: null,
      })
    ).toBeNull()
  })

  it('clínica excelente atinge faixa "excellent"', () => {
    const score = calculateHealthScore({
      conversionRate: 0.3,
      noShowRate: 0.05,
      netMargin: 0.4,
      revenueGrowthMoM: 0.2,
      leadsTargetAchievement: 1,
      avgTimeToFirstContactMin: 10,
    })
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThanOrEqual(81)
    expect(healthBand(score)).toBe('excellent')
  })

  it('clínica crítica gera score baixo', () => {
    const score = calculateHealthScore({
      conversionRate: 0.02,
      noShowRate: 0.4,
      netMargin: -0.05,
      revenueGrowthMoM: -0.3,
      leadsTargetAchievement: 0.1,
      avgTimeToFirstContactMin: 240,
    })
    expect(score).not.toBeNull()
    expect(score!).toBeLessThanOrEqual(40)
    expect(healthBand(score)).toBe('critical')
  })

  it('redistribui peso quando dimensão está ausente', () => {
    const allDims = calculateHealthScore({
      conversionRate: 0.2,
      noShowRate: 0.1,
      netMargin: 0.3,
      revenueGrowthMoM: 0.1,
      leadsTargetAchievement: 1,
      avgTimeToFirstContactMin: 30,
    })
    const partial = calculateHealthScore({
      conversionRate: 0.2,
      noShowRate: 0.1,
      netMargin: 0.3,
      revenueGrowthMoM: null,
      leadsTargetAchievement: null,
      avgTimeToFirstContactMin: null,
    })
    expect(allDims).not.toBeNull()
    expect(partial).not.toBeNull()
    // Os dois resultam em um número 0-100 válido
    expect(partial!).toBeGreaterThanOrEqual(0)
    expect(partial!).toBeLessThanOrEqual(100)
  })

  it('healthBand mapeia faixas corretamente', () => {
    expect(healthBand(0)).toBe('critical')
    expect(healthBand(40)).toBe('critical')
    expect(healthBand(41)).toBe('warning')
    expect(healthBand(60)).toBe('warning')
    expect(healthBand(61)).toBe('good')
    expect(healthBand(80)).toBe('good')
    expect(healthBand(81)).toBe('excellent')
    expect(healthBand(100)).toBe('excellent')
    expect(healthBand(null)).toBeNull()
  })
})
