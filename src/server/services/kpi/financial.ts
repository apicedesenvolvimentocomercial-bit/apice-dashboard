import type { FinancialInputs, FinancialKpis } from './types'

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

export function calculateFinancialKpis(
  input: FinancialInputs,
  context?: { noShowCount?: number; averageTicketForLost?: number }
): FinancialKpis {
  const totalRevenue = input.revenueTotal
  const totalCosts = input.costTotalAll
  const netProfit = totalRevenue - totalCosts
  const grossCosts = input.costVariable + input.costMarketing

  const grossMargin = ratio(totalRevenue - grossCosts, totalRevenue)
  const netMargin = ratio(netProfit, totalRevenue)
  const averageTicket = ratio(totalRevenue, input.revenueCount)

  // ROI marketing = (receita_atribuída - custo_marketing) / custo_marketing
  const roi = ratio(input.revenueAttributedToMarketing - input.costMarketing, input.costMarketing)

  // CAC = custo_marketing / novos_pacientes
  const cac = ratio(input.costMarketing, input.newPatientsCount)

  const estimatedLostRevenue =
    (context?.noShowCount ?? 0) * (context?.averageTicketForLost ?? averageTicket ?? 0)

  return {
    totalRevenue,
    totalCosts,
    netProfit,
    grossMargin,
    netMargin,
    averageTicket,
    marketingCost: input.costMarketing,
    roi,
    cac,
    estimatedLostRevenue,
  }
}

/**
 * Crescimento percentual mês-a-mês. Retorna null se mês anterior = 0.
 */
export function calculateMoMGrowth(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return (current - previous) / previous
}
