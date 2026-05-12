import type { CommercialInputs, CommercialKpis } from './types'

// Section 8 do prompt: divisão por zero retorna null (UI exibe "—").
function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

export function calculateCommercialKpis(input: CommercialInputs): CommercialKpis {
  return {
    leadsCount: input.leadsCount,
    appointmentsCount: input.appointmentsCount,
    attendedCount: input.attendedCount,
    noShowCount: input.noShowCount,
    conversionRate: ratio(input.wonCount, input.leadsCount),
    noShowRate: ratio(input.noShowCount, input.appointmentsCount),
    attendanceRate: ratio(input.attendedCount, input.appointmentsCount),
    avgTimeToFirstContactMin: input.avgTimeToFirstContactMin,
  }
}
