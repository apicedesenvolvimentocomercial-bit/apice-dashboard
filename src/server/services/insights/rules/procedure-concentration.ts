import { PROCEDURE_CONCENTRATION_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'procedure_concentration'

export const procedureConcentrationRule: InsightRule = {
  key: KEY,
  category: 'OPERATIONAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    const grouped = await prisma.revenue.groupBy({
      by: ['procedureId'],
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        date: { gte: from, lte: now },
        procedureId: { not: null },
      },
      _sum: { amount: true },
    })

    const total = grouped.reduce((sum, g) => sum + Number(g._sum.amount ?? 0), 0)
    if (total <= 0) return null

    const top = grouped
      .map((g) => ({ procedureId: g.procedureId, amount: Number(g._sum.amount ?? 0) }))
      .sort((a, b) => b.amount - a.amount)[0]

    if (!top || !top.procedureId) return null
    const share = top.amount / total
    if (share <= PROCEDURE_CONCENTRATION_THRESHOLD) return null

    const procedure = await prisma.procedure.findUnique({
      where: { id: top.procedureId },
      select: { name: true },
    })

    return {
      ruleKey: KEY,
      category: 'OPERATIONAL',
      severity: 'INFO',
      title: 'Concentração elevada em um único procedimento',
      diagnosis: `${procedure?.name ?? 'Um único procedimento'} representa ${(share * 100).toFixed(0)}% da receita dos últimos 90 dias.`,
      estimatedImpact: null,
      suggestion:
        'Diversifique a oferta com pacotes complementares e treine a equipe para cross-sell.',
      metadata: {
        share,
        procedureName: procedure?.name,
        metric: { value: `${(share * 100).toFixed(0)}%`, label: 'da receita' },
      },
    }
  },
}
