import type { CommercialInputs, CommercialKpis } from './types'

// Section 8 do prompt: divisão por zero retorna null (UI exibe "—").
function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

/**
 * Denominador de "desfecho conhecido": só conta appointments que efetivamente
 * aconteceram (ATTENDED) ou não-aconteceram por falta (NO_SHOW). Futuros
 * (SCHEDULED/CONFIRMED), cancelamentos comunicados (CANCELED) e remarcações
 * (RESCHEDULED) não contam — eles diluiriam a taxa de no-show e a de
 * comparecimento contra a realidade operacional.
 */
export function calculateCommercialKpis(input: CommercialInputs): CommercialKpis {
  const completed = input.attendedCount + input.noShowCount

  return {
    leadsCount: input.leadsCount,
    appointmentsCount: input.appointmentsCount,
    attendedCount: input.attendedCount,
    noShowCount: input.noShowCount,
    conversionRate: ratio(input.wonCount, input.leadsCount),
    noShowRate: ratio(input.noShowCount, completed),
    attendanceRate: ratio(input.attendedCount, completed),
    avgTimeToFirstContactMin: input.avgTimeToFirstContactMin,
  }
}
