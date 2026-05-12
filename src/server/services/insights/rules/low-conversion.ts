import { prisma } from '@/lib/prisma'
import { CONVERSION_WARNING_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'low_conversion'

export const lowConversionRule: InsightRule = {
  key: KEY,
  category: 'COMMERCIAL',

  async evaluate({ organizationId, clientId, now }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [leadsCount, wonCount] = await Promise.all([
      prisma.lead.count({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          createdAt: { gte: from, lte: now },
        },
      }),
      prisma.lead.count({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          closedAt: { gte: from, lte: now },
          stage: { isWon: true },
        },
      }),
    ])

    if (leadsCount < 10) return null
    const rate = wonCount / leadsCount
    if (rate >= CONVERSION_WARNING_THRESHOLD) return null

    return {
      ruleKey: KEY,
      category: 'COMMERCIAL',
      severity: 'WARNING',
      title: 'Conversão de leads abaixo do esperado',
      diagnosis: `Sua taxa de conversão nos últimos 30 dias está em ${(rate * 100).toFixed(1)}% (mínimo saudável: ${(CONVERSION_WARNING_THRESHOLD * 100).toFixed(0)}%).`,
      estimatedImpact: null,
      suggestion:
        'Revise a abordagem inicial, dê treinamento ao atendimento e considere ofertar primeiro horário gratuito para leads frios.',
      metadata: { rate, leads: leadsCount, won: wonCount },
    }
  },
}
