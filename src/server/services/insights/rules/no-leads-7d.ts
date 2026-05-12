import { prisma } from '@/lib/prisma'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'no_leads_7d'

export const noLeads7dRule: InsightRule = {
  key: KEY,
  category: 'MARKETING',

  async evaluate({ organizationId, clientId, now }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const leadsCount = await prisma.lead.count({
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        createdAt: { gte: from, lte: now },
      },
    })

    if (leadsCount > 0) return null

    return {
      ruleKey: KEY,
      category: 'MARKETING',
      severity: 'WARNING',
      title: 'Funil sem leads há 7 dias',
      diagnosis:
        'Nenhum novo lead foi registrado nos últimos 7 dias. Funil de aquisição está seco.',
      estimatedImpact: null,
      suggestion:
        'Verifique se as campanhas pagas estão ativas, formulários funcionando e canais orgânicos rodando.',
      metadata: { since: from.toISOString() },
    }
  },
}
