import { INACTIVE_PATIENTS_THRESHOLD } from '@/lib/constants'

import type { InsightCandidate, InsightRule, RuleInput } from '../types'

const KEY = 'inactive_patients'

export const inactivePatientsRule: InsightRule = {
  key: KEY,
  category: 'RETENTION',

  async evaluate({
    organizationId,
    clientId,
    now,
    prisma,
  }: RuleInput): Promise<InsightCandidate | null> {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

    const [activeBase, returned] = await Promise.all([
      prisma.patient.count({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          firstVisitAt: { lte: ninetyDaysAgo, gte: oneYearAgo },
        },
      }),
      prisma.patient.count({
        where: {
          organizationId,
          clientId,
          deletedAt: null,
          firstVisitAt: { lte: ninetyDaysAgo, gte: oneYearAgo },
          lastVisitAt: { gte: ninetyDaysAgo },
        },
      }),
    ])

    if (activeBase < 5) return null
    const retention = returned / activeBase
    if (retention >= INACTIVE_PATIENTS_THRESHOLD) return null

    return {
      ruleKey: KEY,
      category: 'RETENTION',
      severity: 'WARNING',
      title: 'Baixa retenção de pacientes',
      diagnosis: `Apenas ${(retention * 100).toFixed(0)}% dos pacientes voltaram nos últimos 90 dias (mínimo saudável: ${(INACTIVE_PATIENTS_THRESHOLD * 100).toFixed(0)}%).`,
      estimatedImpact: null,
      suggestion:
        'Crie programa de retorno com lembretes automáticos e ofertas para pacientes inativos há 90+ dias.',
      metadata: {
        retention,
        base: activeBase,
        returned,
        metric: { value: `${(retention * 100).toFixed(0)}%`, label: 'voltaram em 90 dias' },
      },
    }
  },
}
