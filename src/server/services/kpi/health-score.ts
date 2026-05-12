import type { HealthScoreInputs } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Seção 7.14 do prompt. Score 0-100, soma ponderada das dimensões disponíveis.
 * Cada dimensão que vier `null` é desprezada (peso redistribuído).
 */
export function calculateHealthScore(input: HealthScoreInputs): number | null {
  const dims: { weight: number; score: number }[] = []

  if (input.conversionRate != null) {
    dims.push({ weight: 25, score: clamp(input.conversionRate * 100 * 5, 0, 100) })
  }

  if (input.noShowRate != null) {
    dims.push({ weight: 20, score: clamp(100 - input.noShowRate * 100 * 4, 0, 100) })
  }

  if (input.netMargin != null) {
    dims.push({ weight: 20, score: clamp(input.netMargin * 100 * 2.5, 0, 100) })
  }

  if (input.revenueGrowthMoM != null) {
    dims.push({ weight: 15, score: clamp((input.revenueGrowthMoM * 100 + 20) * 2.5, 0, 100) })
  }

  if (input.leadsTargetAchievement != null) {
    dims.push({ weight: 10, score: clamp(input.leadsTargetAchievement * 100, 0, 100) })
  }

  if (input.avgTimeToFirstContactMin != null) {
    // 0 min = 100, >=120 min = 0, linear entre.
    const minutes = input.avgTimeToFirstContactMin
    const score = clamp(100 - (minutes / 120) * 100, 0, 100)
    dims.push({ weight: 10, score })
  }

  if (dims.length === 0) return null
  const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0)
  const weighted = dims.reduce((sum, d) => sum + d.weight * d.score, 0)
  return Math.round(weighted / totalWeight)
}

export type HealthBand = 'critical' | 'warning' | 'good' | 'excellent'

export function healthBand(score: number | null): HealthBand | null {
  if (score == null) return null
  if (score <= 40) return 'critical'
  if (score <= 60) return 'warning'
  if (score <= 80) return 'good'
  return 'excellent'
}
