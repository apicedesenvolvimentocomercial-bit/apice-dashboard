import { NO_SHOW_CRITICAL_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'high_no_show'

export const highNoShowRule: InsightRule = {
  key: KEY,
  category: 'OPERATIONAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const grouped = await prisma.appointment.groupBy({
      by: ['status'],
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        scheduledAt: { gte: from, lte: now },
      },
      _count: { _all: true },
    })

    const total = grouped.reduce((sum, g) => sum + g._count._all, 0)
    if (total < 5) return null

    const noShow = grouped.find((g) => g.status === 'NO_SHOW')?._count._all ?? 0
    const rate = noShow / total
    if (rate <= NO_SHOW_CRITICAL_THRESHOLD) return null

    const ticketAgg = await prisma.revenue.aggregate({
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        date: { gte: from, lte: now },
      },
      _sum: { amount: true },
      _count: { _all: true },
    })
    const avgTicket =
      ticketAgg._count._all > 0 ? Number(ticketAgg._sum.amount ?? 0) / ticketAgg._count._all : 0

    return {
      ruleKey: KEY,
      category: 'OPERATIONAL',
      severity: 'CRITICAL',
      title: 'Taxa de no-show acima do crítico',
      diagnosis: `Sua clínica registrou ${(rate * 100).toFixed(0)}% de faltas nos últimos 30 dias, contra a média saudável de até ${(NO_SHOW_CRITICAL_THRESHOLD * 100).toFixed(0)}%.`,
      estimatedImpact: avgTicket > 0 ? noShow * avgTicket : null,
      suggestion:
        'Ative confirmação automática via WhatsApp 24h antes do agendamento e exija sinal/cadastro de cartão para reservar horário.',
      metadata: {
        rate,
        noShowCount: noShow,
        total,
        metric: { value: `${(rate * 100).toFixed(0)}%`, label: 'de faltas em 30 dias' },
      },
    }
  },
}
