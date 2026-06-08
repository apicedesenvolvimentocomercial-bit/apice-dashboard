import { metricLabel } from '@/shared/goal-labels'
import type { InsightCandidate, InsightRule, PrismaLike, RuleInput } from '../types'

const KEY = 'goal_at_risk'

async function currentValue(
  prisma: PrismaLike,
  organizationId: string,
  clientId: string,
  goal: { metric: string; startDate: Date; endDate: Date }
): Promise<number> {
  const range = { gte: goal.startDate, lte: goal.endDate }
  switch (goal.metric) {
    case 'REVENUE': {
      const r = await prisma.revenue.aggregate({
        where: { organizationId, clientId, deletedAt: null, date: range },
        _sum: { amount: true },
      })
      return Number(r._sum.amount ?? 0)
    }
    case 'LEADS':
      return prisma.lead.count({
        where: { organizationId, clientId, deletedAt: null, createdAt: range },
      })
    case 'APPOINTMENTS':
      return prisma.appointment.count({
        where: { organizationId, clientId, deletedAt: null, scheduledAt: range },
      })
    case 'NEW_PATIENTS':
      return prisma.patient.count({
        where: { organizationId, clientId, deletedAt: null, createdAt: range },
      })
    default:
      return 0
  }
}

export const goalAtRiskRule: InsightRule = {
  key: KEY,
  category: 'OPERATIONAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const goals = await prisma.goal.findMany({
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        endDate: { gte: now, lte: sevenDaysAhead },
        startDate: { lte: now },
      },
    })

    if (goals.length === 0) return null

    const evaluated: { goal: (typeof goals)[number]; progress: number }[] = []
    for (const g of goals) {
      const cur = await currentValue(prisma, organizationId, clientId, g)
      const target = Number(g.targetValue)
      const progress = target > 0 ? cur / target : 0
      if (progress < 0.5) evaluated.push({ goal: g, progress })
    }

    if (evaluated.length === 0) return null
    evaluated.sort((a, b) => a.progress - b.progress)
    const worst = evaluated[0]
    const daysLeft = Math.max(
      1,
      Math.ceil((worst.goal.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    )

    return {
      ruleKey: KEY,
      category: 'OPERATIONAL',
      severity: 'WARNING',
      title: 'Meta em risco de não bater',
      diagnosis: `Meta "${metricLabel(worst.goal.metric)}" está com ${(worst.progress * 100).toFixed(0)}% de atingimento faltando ${daysLeft} dia(s) para o fim do período.`,
      estimatedImpact: null,
      suggestion:
        'Concentre esforços comerciais nesta meta — reative leads, acelere agendamentos e reforce upsell.',
      metadata: { goalId: worst.goal.id, progress: worst.progress, daysLeft },
    }
  },
}
