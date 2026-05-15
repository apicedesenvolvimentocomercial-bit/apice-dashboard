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
  /** "Receita gerada" = soma do valor cheio na data da venda. Últimos 12 meses. */
  revenueByMonth: { month: string; revenue: number; costs: number }[]
  /**
   * "Receita recebida" = simulação de fluxo de caixa. Cada parcela é distribuída
   * no mês de competência: valor ÷ installments por mês a partir de `date`.
   *
   * Janela ampla (12 meses passados + atual + 12 meses futuros = 25 meses).
   * Meses futuros incluem projeção de custos recorrentes (templates
   * `isRecurring: true`) ainda não materializados. `centerIndex` aponta para
   * o mês atual; a UI fatia em uma janela visível ao redor desse índice.
   */
  receivedByMonth: { month: string; revenue: number; costs: number; isFuture: boolean }[]
  receivedCenterIndex: number
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

    const [
      kpis,
      revRows,
      costRows,
      recurringTemplates,
      stages,
      proceduresAgg,
      leadsBySource,
      insightsOpen,
      goals,
    ] = await Promise.all([
      computeClinicKpis(ctx, clientId, range),
      prisma.revenue.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          // Janela ampliada para 36 meses atrás: cobre parcelas com prazos
          // longos cujas parcelas ainda caem dentro da janela visível.
          date: { gte: spDate(new Date().getFullYear() - 3, new Date().getMonth() + 1, 1) },
        },
        select: { amount: true, date: true, installments: true },
      }),
      // Custos materializados (não-templates) dos últimos 12 meses + atual.
      prisma.cost.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          isRecurring: false,
          date: { gte: spDate(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1) },
        },
        select: { amount: true, date: true, recurringSourceId: true },
      }),
      // Templates de custos recorrentes (fixos) ativos. Usados para projetar
      // o futuro e descontar das materializações já existentes.
      prisma.cost.findMany({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          isRecurring: true,
        },
        select: { id: true, amount: true, createdAt: true },
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

    // Bucket "Receita gerada": 12 meses passados + atual (igual antes).
    const generatedBuckets = new Map<string, { revenue: number; costs: number; label: string }>()
    for (let i = 11; i >= 0; i--) {
      const first = spDate(now.getFullYear(), now.getMonth() - i, 1)
      generatedBuckets.set(monthKey(first), {
        revenue: 0,
        costs: 0,
        label: shortMonthLabel(first),
      })
    }

    // Bucket "Receita recebida": janela ampla com 12 passados + atual + 12 futuros.
    // Cada entrada sabe se é futuro (para projetar custos recorrentes e marcar
    // visualmente na UI). currentMonthStart é a fronteira passado/futuro.
    const currentMonthStart = spDate(now.getFullYear(), now.getMonth(), 1).getTime()
    type ReceivedBucket = {
      revenue: number
      costs: number
      label: string
      monthStart: number
      isFuture: boolean
    }
    const receivedBuckets = new Map<string, ReceivedBucket>()
    let receivedCenterIndex = 0
    {
      let idx = 0
      for (let i = -12; i <= 12; i++) {
        const first = spDate(now.getFullYear(), now.getMonth() + i, 1)
        if (i === 0) receivedCenterIndex = idx
        receivedBuckets.set(monthKey(first), {
          revenue: 0,
          costs: 0,
          label: shortMonthLabel(first),
          monthStart: first.getTime(),
          isFuture: first.getTime() > currentMonthStart,
        })
        idx++
      }
    }

    for (const r of revRows) {
      const amount = Number(r.amount)
      const installments = r.installments && r.installments > 0 ? r.installments : 1

      // Receita gerada: valor cheio no mês da venda.
      const generatedBucket = generatedBuckets.get(monthKey(r.date))
      if (generatedBucket) generatedBucket.revenue += amount

      // Receita recebida: 1 parcela = amount / installments por mês,
      // a partir do mês de `r.date`. Parcelas fora da janela são descartadas.
      const perInstallment = amount / installments
      const baseYear = r.date.getFullYear()
      const baseMonth = r.date.getMonth()
      for (let i = 0; i < installments; i++) {
        const month = spDate(baseYear, baseMonth + i, 1)
        const target = receivedBuckets.get(monthKey(month))
        if (target) target.revenue += perInstallment
      }
    }

    // Custos materializados (rows reais). Para o bucket "recebida", também
    // contamos quantos templates recorrentes JÁ foram materializados em cada
    // mês, para não duplicar quando projetarmos o futuro.
    const materializedRecurringByMonth = new Map<string, Set<string>>()
    for (const c of costRows) {
      const key = monthKey(c.date)
      const amount = Number(c.amount)
      const gen = generatedBuckets.get(key)
      if (gen) gen.costs += amount
      const rec = receivedBuckets.get(key)
      if (rec) rec.costs += amount
      if (c.recurringSourceId) {
        const set = materializedRecurringByMonth.get(key) ?? new Set<string>()
        set.add(c.recurringSourceId)
        materializedRecurringByMonth.set(key, set)
      }
    }

    // Projeção de custos recorrentes: a partir do mês atual em diante, para
    // cada template ativo (createdAt <= início desse mês), adiciona o valor
    // se ainda não foi materializado naquele mês.
    for (const [key, bucket] of receivedBuckets) {
      if (bucket.monthStart < currentMonthStart) continue // passado: confia no materializado
      const materializedSet = materializedRecurringByMonth.get(key) ?? new Set<string>()
      for (const t of recurringTemplates) {
        if (t.createdAt.getTime() > bucket.monthStart) continue
        if (materializedSet.has(t.id)) continue
        bucket.costs += Number(t.amount)
      }
    }

    const revenueByMonth = Array.from(generatedBuckets.values()).map((b) => ({
      month: b.label,
      revenue: b.revenue,
      costs: b.costs,
    }))
    const receivedByMonth = Array.from(receivedBuckets.values()).map((b) => ({
      month: b.label,
      revenue: b.revenue,
      costs: b.costs,
      isFuture: b.isFuture,
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

    // Mantém Client.healthScore sincronizado com o valor ao vivo (período atual).
    // Períodos históricos não sobrescrevem o score do mês corrente.
    if (period === 'month' && kpis.healthScore != null) {
      await prisma.client.update({
        where: { id: clientId },
        data: { healthScore: kpis.healthScore },
      })
    }

    return {
      range,
      kpis,
      revenueByMonth,
      receivedByMonth,
      receivedCenterIndex,
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
