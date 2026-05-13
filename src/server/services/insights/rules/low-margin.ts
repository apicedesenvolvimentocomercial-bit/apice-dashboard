import { MARGIN_WARNING_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'low_margin'

export const lowMarginRule: InsightRule = {
  key: KEY,
  category: 'FINANCIAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1)

    const [revAgg, costAgg] = await Promise.all([
      prisma.revenue.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.cost.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
    ])

    const revenue = Number(revAgg._sum.amount ?? 0)
    const cost = Number(costAgg._sum.amount ?? 0)
    if (revenue <= 0) return null
    const margin = (revenue - cost) / revenue
    if (margin >= MARGIN_WARNING_THRESHOLD) return null

    return {
      ruleKey: KEY,
      category: 'FINANCIAL',
      severity: 'WARNING',
      title: 'Margem líquida abaixo do mínimo recomendado',
      diagnosis: `A margem líquida do mês corrente é de ${(margin * 100).toFixed(1)}%, abaixo do mínimo saudável de ${(MARGIN_WARNING_THRESHOLD * 100).toFixed(0)}%.`,
      estimatedImpact: revenue * (MARGIN_WARNING_THRESHOLD - margin),
      suggestion:
        'Audite custos por categoria, reprecifique procedimentos com margem baixa e renegocie contratos fixos.',
      metadata: { margin, revenue, cost },
    }
  },
}
