import { Prisma } from '@prisma/client'

import { prisma as defaultPrisma } from '@/lib/prisma'
import { monthBoundsFor, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'

import { computeClinicKpis } from '@/server/services/kpi/clinic-kpis'
import { calculateHealthScore } from '@/server/services/kpi/health-score'
import type { PeriodRange } from '@/server/services/kpi/types'

export type SnapshotsRunResult = {
  scanned: number
  daily: number
  monthly: number
  errors: number
}

/**
 * Persiste um KpiSnapshot para uma clínica num período. Idempotente:
 * a unique key `[clientId, periodType, periodStart]` garante 1 linha por chave.
 */
async function persistSnapshot(opts: {
  organizationId: string
  clientId: string
  periodType: 'daily' | 'monthly'
  range: PeriodRange
  prisma: typeof defaultPrisma
}) {
  const { organizationId, clientId, periodType, range, prisma } = opts
  const ctx = { organizationId, userId: 'system', role: 'ADMIN' as const, clientId: null }
  const kpi = await computeClinicKpis(ctx, clientId, range)

  const data = {
    organizationId,
    clientId,
    periodType,
    periodStart: range.from,
    periodEnd: range.to,
    leadsCount: kpi.commercial.leadsCount,
    appointmentsCount: kpi.commercial.appointmentsCount,
    attendedCount: kpi.commercial.attendedCount,
    noShowCount: kpi.commercial.noShowCount,
    conversionRate:
      kpi.commercial.conversionRate != null
        ? new Prisma.Decimal(kpi.commercial.conversionRate)
        : null,
    noShowRate:
      kpi.commercial.noShowRate != null ? new Prisma.Decimal(kpi.commercial.noShowRate) : null,
    avgTimeToFirstContact: kpi.commercial.avgTimeToFirstContactMin,
    totalRevenue: new Prisma.Decimal(kpi.financial.totalRevenue),
    totalCosts: new Prisma.Decimal(kpi.financial.totalCosts),
    grossMargin:
      kpi.financial.grossMargin != null ? new Prisma.Decimal(kpi.financial.grossMargin) : null,
    netMargin: kpi.financial.netMargin != null ? new Prisma.Decimal(kpi.financial.netMargin) : null,
    averageTicket:
      kpi.financial.averageTicket != null ? new Prisma.Decimal(kpi.financial.averageTicket) : null,
    marketingCost: new Prisma.Decimal(kpi.financial.marketingCost),
    roi: kpi.financial.roi != null ? new Prisma.Decimal(kpi.financial.roi) : null,
    cac: kpi.financial.cac != null ? new Prisma.Decimal(kpi.financial.cac) : null,
    healthScore: kpi.healthScore,
    computedAt: new Date(),
  }

  await prisma.kpiSnapshot.upsert({
    where: {
      clientId_periodType_periodStart: { clientId, periodType, periodStart: range.from },
    },
    create: data,
    update: data,
  })

  return kpi
}

export async function runSnapshotsJob(
  referenceDate: Date = new Date(),
  prismaClient = defaultPrisma
): Promise<SnapshotsRunResult> {
  const clients = await prismaClient.client.findMany({
    where: { deletedAt: null },
    select: { id: true, organizationId: true },
  })

  const { year, month0 } = monthBoundsFor(referenceDate)
  const monthStart = spDate(year, month0, 1)
  const monthEnd = new Date(spDate(year, month0 + 1, 1).getTime() - 1)

  const dayKey = referenceDate
  const dayBounds = monthBoundsFor(dayKey)
  const dayStart = spDate(dayBounds.year, dayBounds.month0, dayBounds.day, 0, 0, 0)
  const dayEnd = new Date(
    spDate(dayBounds.year, dayBounds.month0, dayBounds.day + 1, 0, 0, 0).getTime() - 1
  )

  let daily = 0
  let monthly = 0
  let errors = 0

  for (const c of clients) {
    try {
      await persistSnapshot({
        organizationId: c.organizationId,
        clientId: c.id,
        periodType: 'daily',
        range: { key: 'day', from: dayStart, to: dayEnd },
        prisma: prismaClient,
      })
      daily++

      const monthKpi = await persistSnapshot({
        organizationId: c.organizationId,
        clientId: c.id,
        periodType: 'monthly',
        range: { key: 'month', from: monthStart, to: monthEnd },
        prisma: prismaClient,
      })
      monthly++

      // Atualiza health score "vivo" no Client (Section 7.14).
      const score =
        monthKpi.healthScore ??
        calculateHealthScore({
          conversionRate: monthKpi.commercial.conversionRate,
          noShowRate: monthKpi.commercial.noShowRate,
          netMargin: monthKpi.financial.netMargin,
          revenueGrowthMoM: monthKpi.revenueGrowthMoM,
          leadsTargetAchievement: null,
          avgTimeToFirstContactMin: monthKpi.commercial.avgTimeToFirstContactMin,
        })

      await prismaClient.client.update({
        where: { id: c.id },
        data: { healthScore: score, lastSnapshotAt: new Date() },
      })
    } catch (err) {
      errors++
      logger.error('KPI snapshot failed', {
        clientId: c.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const summary = { scanned: clients.length, daily, monthly, errors }
  logger.info('KPI snapshots job complete', summary)
  return summary
}
