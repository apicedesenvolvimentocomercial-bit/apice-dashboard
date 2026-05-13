import { addYears } from 'date-fns'
import { cache } from 'react'

import { prisma } from '@/lib/prisma'
import { monthKey, shortMonthLabel, spDate } from '@/lib/date'
import {
  computeClinicKpis,
  computeGlobalKpis,
  type ClinicKpis,
  type GlobalKpis,
} from '@/server/services/kpi/clinic-kpis'
import { resolvePeriod } from '@/server/services/kpi/period'
import type { Period, PeriodRange } from '@/server/services/kpi/types'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

/**
 * React cache: dedup de chamadas dentro do mesmo Server Render.
 * Útil quando múltiplos componentes (cards, charts) pedem o mesmo recurso.
 */
const getRange = cache(
  (period: Period, customFrom?: string, customTo?: string): PeriodRange =>
    resolvePeriod(period, new Date(), { from: customFrom, to: customTo })
)

export type AdminDashboardData = {
  range: PeriodRange
  global: GlobalKpis
  revenueByMonth: { month: string; revenue: number; previousYear: number }[]
  clinicsRanking: {
    clientId: string
    name: string
    revenue: number
    leads: number
    conversionRate: number | null
    noShowRate: number | null
    netMargin: number | null
    healthScore: number | null
    status: string
  }[]
  revenueShare: { clientId: string; name: string; revenue: number }[]
  insightsCritical: {
    id: string
    title: string
    clientName: string
    severity: string
    createdAt: Date
  }[]
}

export const getAdminDashboard = cache(
  async (
    period: Period = 'month',
    customFrom?: string,
    customTo?: string
  ): Promise<AdminDashboardData> => {
    const ctx = await getTenantContext()
    const range = getRange(period, customFrom, customTo)

    const [global, clinics, revAgg, costAgg, leadAgg, apptAgg, wonLeads] = await Promise.all([
      computeGlobalKpis(ctx, range),
      prisma.client.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, name: true, healthScore: true, status: true },
      }),
      prisma.revenue.groupBy({
        by: ['clientId'],
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          date: { gte: range.from, lte: range.to },
        },
        _sum: { amount: true },
      }),
      prisma.cost.groupBy({
        by: ['clientId'],
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          date: { gte: range.from, lte: range.to },
        },
        _sum: { amount: true },
      }),
      prisma.lead.groupBy({
        by: ['clientId'],
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
      }),
      prisma.appointment.groupBy({
        by: ['clientId', 'status'],
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          scheduledAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
      }),
      prisma.lead.findMany({
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          closedAt: { gte: range.from, lte: range.to },
          stage: { isWon: true },
        },
        select: { clientId: true },
      }),
    ])

    const revByClient = new Map(revAgg.map((r) => [r.clientId, Number(r._sum.amount ?? 0)]))
    const costByClient = new Map(costAgg.map((c) => [c.clientId, Number(c._sum.amount ?? 0)]))
    const leadsByClient = new Map(leadAgg.map((l) => [l.clientId, l._count._all]))

    // No-show rate: denominador = desfechos conhecidos (ATTENDED + NO_SHOW).
    // Futuros e cancelamentos não diluem a taxa.
    const apptAttendedByClient = new Map<string, number>()
    const apptNoShowByClient = new Map<string, number>()
    for (const a of apptAgg) {
      if (a.status === 'ATTENDED') {
        apptAttendedByClient.set(
          a.clientId,
          (apptAttendedByClient.get(a.clientId) ?? 0) + a._count._all
        )
      } else if (a.status === 'NO_SHOW') {
        apptNoShowByClient.set(
          a.clientId,
          (apptNoShowByClient.get(a.clientId) ?? 0) + a._count._all
        )
      }
    }

    const wonByClient = new Map<string, number>()
    for (const w of wonLeads) {
      wonByClient.set(w.clientId, (wonByClient.get(w.clientId) ?? 0) + 1)
    }

    const ranking = clinics
      .map((c) => {
        const revenue = revByClient.get(c.id) ?? 0
        const costs = costByClient.get(c.id) ?? 0
        const leads = leadsByClient.get(c.id) ?? 0
        const attended = apptAttendedByClient.get(c.id) ?? 0
        const noShow = apptNoShowByClient.get(c.id) ?? 0
        const completedAppts = attended + noShow
        const won = wonByClient.get(c.id) ?? 0
        return {
          clientId: c.id,
          name: c.name,
          revenue,
          leads,
          conversionRate: leads > 0 ? won / leads : null,
          noShowRate: completedAppts > 0 ? noShow / completedAppts : null,
          netMargin: revenue > 0 ? (revenue - costs) / revenue : null,
          healthScore: c.healthScore,
          status: c.status,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    // Receita 12 meses: chave YYYY-MM com label curta pt-BR
    const now = new Date()
    const monthsBack = 12
    const fromMonths = spDate(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1)
    const fromMonthsPrevYear = spDate(now.getFullYear() - 1, now.getMonth() - (monthsBack - 1), 1)
    const toPrevYear = spDate(now.getFullYear() - 1, now.getMonth() + 1, 1)

    const [curYearRows, prevYearRows] = await Promise.all([
      prisma.revenue.findMany({
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          date: { gte: fromMonths },
        },
        select: { amount: true, date: true },
      }),
      prisma.revenue.findMany({
        where: {
          organizationId: ctx.organizationId,
          deletedAt: null,
          date: { gte: fromMonthsPrevYear, lt: toPrevYear },
        },
        select: { amount: true, date: true },
      }),
    ])

    const buckets = new Map<string, { revenue: number; previousYear: number; label: string }>()
    for (let i = monthsBack - 1; i >= 0; i--) {
      const first = spDate(now.getFullYear(), now.getMonth() - i, 1)
      buckets.set(monthKey(first), { revenue: 0, previousYear: 0, label: shortMonthLabel(first) })
    }
    for (const r of curYearRows) {
      const k = monthKey(r.date)
      const b = buckets.get(k)
      if (b) b.revenue += Number(r.amount)
    }
    for (const r of prevYearRows) {
      // Desloca a data em +1 ano preservando fuso e calcula o bucket pelo mês SP.
      const k = monthKey(addYears(r.date, 1))
      const b = buckets.get(k)
      if (b) b.previousYear += Number(r.amount)
    }

    const revenueByMonth = Array.from(buckets.values()).map((b) => ({
      month: b.label,
      revenue: b.revenue,
      previousYear: b.previousYear,
    }))

    const revenueShare = ranking
      .filter((r) => r.revenue > 0)
      .map((r) => ({ clientId: r.clientId, name: r.name, revenue: r.revenue }))
      .slice(0, 8)

    const criticalInsights = await prisma.insight.findMany({
      where: {
        organizationId: ctx.organizationId,
        severity: 'CRITICAL',
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        severity: true,
        createdAt: true,
        client: { select: { name: true } },
      },
    })

    return {
      range,
      global,
      revenueByMonth,
      clinicsRanking: ranking,
      revenueShare,
      insightsCritical: criticalInsights.map((i) => ({
        id: i.id,
        title: i.title,
        clientName: i.client.name,
        severity: i.severity,
        createdAt: i.createdAt,
      })),
    }
  }
)

export type ClinicDashboardData = {
  range: PeriodRange
  kpis: ClinicKpis
  revenueByMonth: { month: string; revenue: number; costs: number }[]
  funnel: { stage: string; count: number; isWon: boolean; isLost: boolean }[]
  revenueByProcedure: { name: string; total: number; count: number }[]
  leadsBySource: { source: string; count: number }[]
  insightsOpen: {
    id: string
    title: string
    severity: string
    suggestion: string
    diagnosis: string
  }[]
  goalsProgress: {
    id: string
    metric: string
    period: string
    targetValue: number
    currentValue: number
    progressPct: number
    endDate: Date
  }[]
}

export const getClinicDashboard = cache(
  async (
    clientId: string,
    period: Period = 'month',
    customFrom?: string,
    customTo?: string
  ): Promise<ClinicDashboardData> => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    const range = getRange(period, customFrom, customTo)

    const [kpis, revRows, costRows, stages, proceduresAgg, leadsBySource, insightsOpen, goals] =
      await Promise.all([
        computeClinicKpis(ctx, clientId, range),
        prisma.revenue.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId,
            deletedAt: null,
            date: { gte: spDate(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1) },
          },
          select: { amount: true, date: true },
        }),
        prisma.cost.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId,
            deletedAt: null,
            date: { gte: spDate(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1) },
          },
          select: { amount: true, date: true },
        }),
        prisma.pipelineStage.findMany({
          where: { clientId },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            isWon: true,
            isLost: true,
            _count: { select: { leads: { where: { deletedAt: null } } } },
          },
        }),
        prisma.revenue.groupBy({
          by: ['procedureId'],
          where: {
            organizationId: ctx.organizationId,
            clientId,
            deletedAt: null,
            date: { gte: range.from, lte: range.to },
            procedureId: { not: null },
          },
          _sum: { amount: true },
          _count: { _all: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 8,
        }),
        prisma.lead.groupBy({
          by: ['source'],
          where: {
            organizationId: ctx.organizationId,
            clientId,
            deletedAt: null,
            createdAt: { gte: range.from, lte: range.to },
          },
          _count: { _all: true },
        }),
        prisma.insight.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
          take: 6,
          select: {
            id: true,
            title: true,
            severity: true,
            suggestion: true,
            diagnosis: true,
          },
        }),
        prisma.goal.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId,
            deletedAt: null,
            endDate: { gte: new Date() },
          },
          orderBy: { endDate: 'asc' },
        }),
      ])

    const now = new Date()
    const buckets = new Map<string, { revenue: number; costs: number; label: string }>()
    for (let i = 11; i >= 0; i--) {
      const first = spDate(now.getFullYear(), now.getMonth() - i, 1)
      buckets.set(monthKey(first), { revenue: 0, costs: 0, label: shortMonthLabel(first) })
    }
    for (const r of revRows) {
      const b = buckets.get(monthKey(r.date))
      if (b) b.revenue += Number(r.amount)
    }
    for (const c of costRows) {
      const b = buckets.get(monthKey(c.date))
      if (b) b.costs += Number(c.amount)
    }
    const revenueByMonth = Array.from(buckets.values()).map((b) => ({
      month: b.label,
      revenue: b.revenue,
      costs: b.costs,
    }))

    const procIds = proceduresAgg
      .map((p) => p.procedureId)
      .filter((id): id is string => Boolean(id))
    const procedures =
      procIds.length > 0
        ? await prisma.procedure.findMany({
            where: { id: { in: procIds } },
            select: { id: true, name: true },
          })
        : []
    const procMap = new Map(procedures.map((p) => [p.id, p.name]))
    const revenueByProcedure = proceduresAgg.map((p) => ({
      name: p.procedureId ? (procMap.get(p.procedureId) ?? 'Desconhecido') : 'Sem procedimento',
      total: Number(p._sum.amount ?? 0),
      count: p._count._all,
    }))

    const funnel = stages.map((s) => ({
      stage: s.name,
      count: s._count.leads,
      isWon: s.isWon,
      isLost: s.isLost,
    }))

    const goalsProgress = await Promise.all(
      goals.map(async (g) => {
        const current = await currentGoalValue(ctx.organizationId, clientId, g)
        const target = Number(g.targetValue)
        const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0
        return {
          id: g.id,
          metric: g.metric,
          period: g.period,
          targetValue: target,
          currentValue: current,
          progressPct,
          endDate: g.endDate,
        }
      })
    )

    return {
      range,
      kpis,
      revenueByMonth,
      funnel,
      revenueByProcedure,
      leadsBySource: leadsBySource.map((g) => ({ source: g.source, count: g._count._all })),
      insightsOpen,
      goalsProgress,
    }
  }
)

async function currentGoalValue(
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
    case 'LEADS': {
      return prisma.lead.count({
        where: { organizationId, clientId, deletedAt: null, createdAt: range },
      })
    }
    case 'APPOINTMENTS': {
      return prisma.appointment.count({
        where: { organizationId, clientId, deletedAt: null, scheduledAt: range },
      })
    }
    case 'NEW_PATIENTS': {
      return prisma.patient.count({
        where: { organizationId, clientId, deletedAt: null, createdAt: range },
      })
    }
    default:
      return 0
  }
}
