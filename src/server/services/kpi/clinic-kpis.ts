import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

import { calculateCommercialKpis } from './commercial'
import { calculateFinancialKpis, calculateMoMGrowth } from './financial'
import { calculateHealthScore } from './health-score'
import type { CommercialKpis, FinancialKpis, PeriodRange } from './types'

export type ClinicKpis = {
  commercial: CommercialKpis
  financial: FinancialKpis
  healthScore: number | null
  revenueGrowthMoM: number | null
  previousRevenue: number
}

type ClientScope = { organizationId: string; clientIds?: string[] }

async function aggregateForRange(
  scope: ClientScope,
  range: PeriodRange
): Promise<{
  leadsCount: number
  wonCount: number
  appointmentsCount: number
  attendedCount: number
  noShowCount: number
  avgTimeToFirstContactMin: number | null
  revenueTotal: number
  revenueCount: number
  costTotal: number
  costMarketing: number
  costVariable: number
  newPatientsCount: number
  revenueAttributedToMarketing: number
}> {
  const clientFilter = scope.clientIds
    ? { clientId: { in: scope.clientIds } }
    : ({} as { clientId?: { in: string[] } })

  const [leadAgg, wonAgg, apptAgg, revenueAgg, costGrouped, newPatientsCount, leadFirstContacts] =
    await Promise.all([
      prisma.lead.count({
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      prisma.lead.count({
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          closedAt: { gte: range.from, lte: range.to },
          stage: { isWon: true },
        },
      }),
      prisma.appointment.groupBy({
        by: ['status'],
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          scheduledAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
      }),
      prisma.revenue.aggregate({
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          date: { gte: range.from, lte: range.to },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.cost.groupBy({
        by: ['type'],
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          date: { gte: range.from, lte: range.to },
        },
        _sum: { amount: true },
      }),
      prisma.patient.count({
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      prisma.lead.findMany({
        where: {
          organizationId: scope.organizationId,
          ...clientFilter,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
          firstContactAt: { not: null },
        },
        select: { createdAt: true, firstContactAt: true },
      }),
    ])

  const apptsByStatus = new Map(apptAgg.map((g) => [g.status, g._count._all]))
  const appointmentsCount = apptAgg.reduce((sum, g) => sum + g._count._all, 0)
  const attendedCount = apptsByStatus.get('ATTENDED') ?? 0
  const noShowCount = apptsByStatus.get('NO_SHOW') ?? 0

  const costByType = new Map(costGrouped.map((g) => [g.type, Number(g._sum.amount ?? 0)]))
  const costMarketing = costByType.get('MARKETING') ?? 0
  const costVariable = costByType.get('VARIABLE') ?? 0
  const costTotal = costGrouped.reduce((sum, g) => sum + Number(g._sum.amount ?? 0), 0)

  const totalMinutes = leadFirstContacts.reduce((sum, l) => {
    if (!l.firstContactAt) return sum
    return sum + (l.firstContactAt.getTime() - l.createdAt.getTime()) / 60000
  }, 0)
  const avgTimeToFirstContactMin =
    leadFirstContacts.length > 0 ? Math.round(totalMinutes / leadFirstContacts.length) : null

  // ROI marketing aproximação: receitas com lead originário de campanha paga.
  const paidSourceRevenues = await prisma.revenue.aggregate({
    where: {
      organizationId: scope.organizationId,
      ...clientFilter,
      deletedAt: null,
      date: { gte: range.from, lte: range.to },
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
  })

  return {
    leadsCount: leadAgg,
    wonCount: wonAgg,
    appointmentsCount,
    attendedCount,
    noShowCount,
    avgTimeToFirstContactMin,
    revenueTotal: Number(revenueAgg._sum.amount ?? 0),
    revenueCount: revenueAgg._count._all,
    costTotal,
    costMarketing,
    costVariable,
    newPatientsCount,
    revenueAttributedToMarketing: Number(paidSourceRevenues._sum.amount ?? 0),
  }
}

export async function computeClinicKpis(
  ctx: TenantContext,
  clientId: string,
  range: PeriodRange,
  options?: { leadTarget?: number }
): Promise<ClinicKpis> {
  const scope: ClientScope = { organizationId: ctx.organizationId, clientIds: [clientId] }

  const [current, previous] = await Promise.all([
    aggregateForRange(scope, range),
    aggregateForRange(scope, {
      key: range.key,
      from: new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime() + 1)),
      to: new Date(range.from.getTime() - 1),
    }),
  ])

  const commercial = calculateCommercialKpis({
    leadsCount: current.leadsCount,
    wonCount: current.wonCount,
    appointmentsCount: current.appointmentsCount,
    attendedCount: current.attendedCount,
    noShowCount: current.noShowCount,
    avgTimeToFirstContactMin: current.avgTimeToFirstContactMin,
  })

  const financial = calculateFinancialKpis(
    {
      revenueTotal: current.revenueTotal,
      costTotalAll: current.costTotal,
      costMarketing: current.costMarketing,
      costVariable: current.costVariable,
      revenueCount: current.revenueCount,
      newPatientsCount: current.newPatientsCount,
      revenueAttributedToMarketing: current.revenueAttributedToMarketing,
    },
    { noShowCount: current.noShowCount }
  )

  const revenueGrowthMoM = calculateMoMGrowth(current.revenueTotal, previous.revenueTotal)

  const healthScore = calculateHealthScore({
    conversionRate: commercial.conversionRate,
    noShowRate: commercial.noShowRate,
    netMargin: financial.netMargin,
    revenueGrowthMoM,
    leadsTargetAchievement:
      options?.leadTarget && options.leadTarget > 0
        ? current.leadsCount / options.leadTarget
        : null,
    avgTimeToFirstContactMin: current.avgTimeToFirstContactMin,
  })

  return {
    commercial,
    financial,
    healthScore,
    revenueGrowthMoM,
    previousRevenue: previous.revenueTotal,
  }
}

export type GlobalKpis = {
  totalClinics: number
  totalLeads: number
  totalRevenue: number
  conversionRate: number | null
  noShowRate: number | null
  averageHealthScore: number | null
  revenueGrowthMoM: number | null
  estimatedLostRevenue: number
  previousRevenue: number
}

export async function computeGlobalKpis(
  ctx: TenantContext,
  range: PeriodRange
): Promise<GlobalKpis> {
  const clients = await prisma.client.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true, healthScore: true, status: true },
  })
  const activeClients = clients.filter((c) => c.status === 'ACTIVE')

  const [current, previous] = await Promise.all([
    aggregateForRange({ organizationId: ctx.organizationId }, range),
    aggregateForRange(
      { organizationId: ctx.organizationId },
      {
        key: range.key,
        from: new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime() + 1)),
        to: new Date(range.from.getTime() - 1),
      }
    ),
  ])

  const commercial = calculateCommercialKpis({
    leadsCount: current.leadsCount,
    wonCount: current.wonCount,
    appointmentsCount: current.appointmentsCount,
    attendedCount: current.attendedCount,
    noShowCount: current.noShowCount,
    avgTimeToFirstContactMin: current.avgTimeToFirstContactMin,
  })

  const averageTicket =
    current.revenueCount > 0 ? current.revenueTotal / current.revenueCount : null

  const healthScores = clients
    .map((c) => c.healthScore)
    .filter((s): s is number => typeof s === 'number')
  const averageHealthScore =
    healthScores.length > 0
      ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
      : null

  return {
    totalClinics: activeClients.length,
    totalLeads: current.leadsCount,
    totalRevenue: current.revenueTotal,
    conversionRate: commercial.conversionRate,
    noShowRate: commercial.noShowRate,
    averageHealthScore,
    revenueGrowthMoM: calculateMoMGrowth(current.revenueTotal, previous.revenueTotal),
    estimatedLostRevenue: current.noShowCount * (averageTicket ?? 0),
    previousRevenue: previous.revenueTotal,
  }
}
