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
  /**
   * KPIs do período ANTERIOR comparável (period-to-date — ver
   * `comparablePreviousRange`). Alimenta os deltas dos cards do dashboard;
   * o agregado já era computado (custo zero a mais).
   */
  previous: {
    commercial: CommercialKpis
    financial: FinancialKpis
  }
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
  lostRevenueFromNoShows: number
}> {
  const clientFilter = scope.clientIds
    ? { clientId: { in: scope.clientIds } }
    : ({} as { clientId?: { in: string[] } })

  const [
    leadAgg,
    wonAgg,
    apptAgg,
    revenueAgg,
    costGrouped,
    newPatientsCount,
    leadFirstContacts,
    noShowAppointments,
    paidSourceRevenues,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        organizationId: scope.organizationId,
        ...clientFilter,
        deletedAt: null,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    // Convertidos (won): contamos por `closedAt` no período, independente da
    // etapa ATUAL. O card "Fechado" migra p/ a pipeline de Retenção no dia
    // seguinte (deixa de estar numa etapa isWon), mas `closedAt` é o marcador
    // durável da conversão — é setado ao fechar e limpo no retrocesso.
    prisma.lead.count({
      where: {
        organizationId: scope.organizationId,
        ...clientFilter,
        deletedAt: null,
        closedAt: { gte: range.from, lte: range.to },
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
        // Competência: receita reconhecida por `date`, exclui vendas CANCELADAS.
        status: { not: 'CANCELADA' },
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
        // Só pacientes REAIS (mesmo filtro da aba Pacientes): agendar cria
        // paciente provisório (fromScheduledLead) que inflaria o CAC e a
        // contagem de novos pacientes sem ninguém ter comparecido.
        OR: [
          { fromScheduledLead: false },
          { appointments: { some: { status: 'ATTENDED', deletedAt: null } } },
        ],
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
    // Para receita perdida: preço real do procedimento agendado em cada no-show.
    prisma.appointment.findMany({
      where: {
        organizationId: scope.organizationId,
        ...clientFilter,
        deletedAt: null,
        scheduledAt: { gte: range.from, lte: range.to },
        status: 'NO_SHOW',
      },
      select: { procedure: { select: { price: true } } },
    }),
    // ROI marketing: receitas com lead originário de campanha paga.
    prisma.revenue.aggregate({
      where: {
        organizationId: scope.organizationId,
        ...clientFilter,
        deletedAt: null,
        status: { not: 'CANCELADA' },
        date: { gte: range.from, lte: range.to },
        patient: {
          leads: {
            some: { source: { in: ['META_ADS', 'GOOGLE_ADS'] }, deletedAt: null },
          },
        },
      },
      _sum: { amount: true },
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

  const lostRevenueFromNoShows = noShowAppointments.reduce(
    (sum, a) => sum + Number(a.procedure?.price ?? 0),
    0
  )

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
    lostRevenueFromNoShows,
  }
}

// Range "anterior" COMPARÁVEL (period-to-date): o período imediatamente antes do
// atual, mas só até a MESMA fração já decorrida (ex.: hoje é dia 2 do mês → compara
// com o mês passado até o "dia 2"). Sem isso, no começo do período o atual (parcial)
// era comparado contra o anterior INTEIRO → queda artificial de ~100% a cada virada.
function comparablePreviousRange(range: PeriodRange): PeriodRange {
  const periodMs = range.to.getTime() - range.from.getTime() + 1
  const elapsedMs = Math.min(Date.now(), range.to.getTime()) - range.from.getTime()
  const from = new Date(range.from.getTime() - periodMs)
  return { key: range.key, from, to: new Date(from.getTime() + Math.max(0, elapsedMs)) }
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
    aggregateForRange(scope, comparablePreviousRange(range)),
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
      // Quando há pelo menos um no-show com procedimento vinculado, usamos
      // o preço real. Sem isso, cai no fallback noShow × ticket médio.
      lostRevenueFromNoShows:
        current.lostRevenueFromNoShows > 0 ? current.lostRevenueFromNoShows : undefined,
    },
    { noShowCount: current.noShowCount }
  )

  const previousCommercial = calculateCommercialKpis({
    leadsCount: previous.leadsCount,
    wonCount: previous.wonCount,
    appointmentsCount: previous.appointmentsCount,
    attendedCount: previous.attendedCount,
    noShowCount: previous.noShowCount,
    avgTimeToFirstContactMin: previous.avgTimeToFirstContactMin,
  })

  const previousFinancial = calculateFinancialKpis(
    {
      revenueTotal: previous.revenueTotal,
      costTotalAll: previous.costTotal,
      costMarketing: previous.costMarketing,
      costVariable: previous.costVariable,
      revenueCount: previous.revenueCount,
      newPatientsCount: previous.newPatientsCount,
      revenueAttributedToMarketing: previous.revenueAttributedToMarketing,
      lostRevenueFromNoShows:
        previous.lostRevenueFromNoShows > 0 ? previous.lostRevenueFromNoShows : undefined,
    },
    { noShowCount: previous.noShowCount }
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
    previous: { commercial: previousCommercial, financial: previousFinancial },
  }
}

export type GlobalKpis = {
  totalClinics: number
  totalLeads: number
  totalRevenue: number
  mrrFromSubscriptions: number
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
    select: { id: true, healthScore: true, status: true, monthlyFee: true },
  })
  const activeClients = clients.filter((c) => c.status === 'ACTIVE')
  const mrrFromSubscriptions = activeClients.reduce(
    (sum, c) => sum + (c.monthlyFee ? Number(c.monthlyFee) : 0),
    0
  )

  const [current, previous] = await Promise.all([
    aggregateForRange({ organizationId: ctx.organizationId }, range),
    aggregateForRange({ organizationId: ctx.organizationId }, comparablePreviousRange(range)),
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

  // Receita perdida agregada: preferimos o somatório do preço real de
  // procedimentos de NO_SHOWs. Fallback p/ noShow × ticket médio se nenhum
  // appointment do período tinha procedimento vinculado.
  const estimatedLostRevenue =
    current.lostRevenueFromNoShows > 0
      ? current.lostRevenueFromNoShows
      : current.noShowCount * (averageTicket ?? 0)

  return {
    totalClinics: activeClients.length,
    totalLeads: current.leadsCount,
    totalRevenue: current.revenueTotal,
    mrrFromSubscriptions,
    conversionRate: commercial.conversionRate,
    noShowRate: commercial.noShowRate,
    averageHealthScore,
    revenueGrowthMoM: calculateMoMGrowth(current.revenueTotal, previous.revenueTotal),
    estimatedLostRevenue,
    previousRevenue: previous.revenueTotal,
  }
}
