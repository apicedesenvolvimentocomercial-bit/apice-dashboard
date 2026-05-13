import { REVENUE_DROP_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'revenue_drop'

export const revenueDropRule: InsightRule = {
  key: KEY,
  category: 'FINANCIAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthEnd = new Date(monthStart.getTime() - 1)

    const [cur, prev] = await Promise.all([
      prisma.revenue.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          date: { gte: monthStart, lte: now },
        },
        _sum: { amount: true },
      }),
      prisma.revenue.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          date: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        _sum: { amount: true },
      }),
    ])

    const curR = Number(cur._sum.amount ?? 0)
    const prevR = Number(prev._sum.amount ?? 0)
    if (prevR <= 0) return null
    const drop = (prevR - curR) / prevR
    if (drop < REVENUE_DROP_THRESHOLD) return null

    return {
      ruleKey: KEY,
      category: 'FINANCIAL',
      severity: 'CRITICAL',
      title: 'Receita em queda significativa',
      diagnosis: `Receita do mês atual está ${(drop * 100).toFixed(0)}% abaixo do mês anterior (de ${prevR.toLocaleString('pt-BR')} para ${curR.toLocaleString('pt-BR')}).`,
      estimatedImpact: prevR - curR,
      suggestion:
        'Investigue perda de pacientes, retome contato com leads inativos e revise campanhas de marketing.',
      metadata: { drop, current: curR, previous: prevR },
    }
  },
}
