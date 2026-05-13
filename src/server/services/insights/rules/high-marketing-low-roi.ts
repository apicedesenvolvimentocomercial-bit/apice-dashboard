import { HIGH_MARKETING_SPEND_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'high_marketing_low_roi'

export const highMarketingLowRoiRule: InsightRule = {
  key: KEY,
  category: 'MARKETING',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [mkAgg, attributed] = await Promise.all([
      prisma.cost.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          type: 'MARKETING',
          date: { gte: from, lte: now },
        },
        _sum: { amount: true },
      }),
      prisma.revenue.aggregate({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          date: { gte: from, lte: now },
          patient: {
            leads: {
              some: {
                source: { in: ['META_ADS', 'GOOGLE_ADS'] },
                deletedAt: null,
              },
            },
          },
        },
        _sum: { amount: true },
      }),
    ])

    const marketing = Number(mkAgg._sum.amount ?? 0)
    if (marketing < HIGH_MARKETING_SPEND_THRESHOLD) return null

    const revenue = Number(attributed._sum.amount ?? 0)
    const roi = (revenue - marketing) / marketing
    if (roi >= 1) return null

    return {
      ruleKey: KEY,
      category: 'MARKETING',
      severity: 'WARNING',
      title: 'Marketing pago com ROI insuficiente',
      diagnosis: `Gasto de ${marketing.toLocaleString('pt-BR')} em marketing nos últimos 30 dias retornou ROI de ${roi.toFixed(2)}× (alvo mínimo: 1×).`,
      estimatedImpact: marketing - revenue,
      suggestion:
        'Revise campanhas individualmente, pause as piores e teste novas criações/audiências antes de aumentar verba.',
      metadata: { marketing, revenue, roi },
    }
  },
}
