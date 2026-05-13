import { SLOW_FIRST_CONTACT_MIN } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'slow_first_contact'

export const slowFirstContactRule: InsightRule = {
  key: KEY,
  category: 'COMMERCIAL',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const leads = await prisma.lead.findMany({
      where: {
        organizationId,
        clientId,
        deletedAt: null,
        createdAt: { gte: from, lte: now },
        firstContactAt: { not: null },
      },
      select: { createdAt: true, firstContactAt: true },
    })

    if (leads.length < 5) return null

    const totalMin = leads.reduce((sum, l) => {
      if (!l.firstContactAt) return sum
      return sum + (l.firstContactAt.getTime() - l.createdAt.getTime()) / 60000
    }, 0)
    const avg = totalMin / leads.length

    if (avg <= SLOW_FIRST_CONTACT_MIN) return null

    return {
      ruleKey: KEY,
      category: 'COMMERCIAL',
      severity: 'WARNING',
      title: 'Resposta lenta ao primeiro contato',
      diagnosis: `O tempo médio até o primeiro contato com leads está em ${Math.round(avg)} minutos (alvo: até ${SLOW_FIRST_CONTACT_MIN} min).`,
      estimatedImpact: null,
      suggestion:
        'Implemente resposta automática via WhatsApp e atribua leads em até 5 minutos da criação.',
      metadata: { avgMinutes: Math.round(avg), sampleSize: leads.length },
    }
  },
}
