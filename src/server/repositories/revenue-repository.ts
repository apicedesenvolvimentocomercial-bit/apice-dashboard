import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type RevenueRow = Awaited<ReturnType<typeof listRevenues>>[number]

export async function listRevenues(
  ctx: TenantContext,
  clientId: string,
  filters?: { from?: Date; to?: Date }
) {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.from || filters?.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      amount: true,
      date: true,
      description: true,
      paymentMethod: true,
      installments: true,
      createdAt: true,
      patient: { select: { id: true, name: true } },
      procedure: { select: { id: true, name: true } },
    },
  })

  return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
}

export async function createRevenue(
  ctx: TenantContext,
  clientId: string,
  data: {
    amount: number
    date: Date
    description?: string
    paymentMethod?: string
    installments?: number
    patientId?: string
    procedureId?: string
  }
) {
  return prisma.revenue.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      amount: data.amount,
      date: data.date,
      description: data.description,
      paymentMethod: data.paymentMethod,
      installments: data.installments ?? 1,
      patientId: data.patientId,
      procedureId: data.procedureId,
      createdById: ctx.userId,
    },
  })
}

export async function updateRevenue(
  ctx: TenantContext,
  revenueId: string,
  data: Partial<{
    amount: number
    date: Date
    description: string
    paymentMethod: string
    installments: number
    patientId: string
    procedureId: string
  }>
) {
  return prisma.revenue.updateMany({
    where: { id: revenueId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteRevenue(ctx: TenantContext, revenueId: string) {
  return prisma.revenue.updateMany({
    where: { id: revenueId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function getMonthlyRevenueCostData(
  ctx: TenantContext,
  clientId: string,
  months: number = 12
) {
  const from = new Date()
  from.setMonth(from.getMonth() - months + 1)
  from.setDate(1)
  from.setHours(0, 0, 0, 0)

  const [revenues, costs] = await Promise.all([
    prisma.revenue.findMany({
      where: { organizationId: ctx.organizationId, clientId, deletedAt: null, date: { gte: from } },
      select: { amount: true, date: true },
    }),
    prisma.cost.findMany({
      where: { organizationId: ctx.organizationId, clientId, deletedAt: null, date: { gte: from } },
      select: { amount: true, date: true },
    }),
  ])

  const buckets: Record<string, { revenue: number; costs: number }> = {}

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets[key] = { revenue: 0, costs: 0 }
  }

  for (const r of revenues) {
    const d = new Date(r.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (buckets[key]) buckets[key].revenue += Number(r.amount)
  }

  for (const c of costs) {
    const d = new Date(c.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (buckets[key]) buckets[key].costs += Number(c.amount)
  }

  return Object.entries(buckets).map(([key, val]) => {
    const [year, month] = key.split('-')
    const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: '2-digit',
    })
    return { month: label, ...val }
  })
}

export async function getFinancialSummary(ctx: TenantContext, clientId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [curRevenues, curCosts, prevRevenues, prevCosts] = await Promise.all([
    prisma.revenue.aggregate({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.cost.aggregate({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
    }),
    prisma.revenue.aggregate({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        date: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { amount: true },
    }),
    prisma.cost.aggregate({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        date: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { amount: true },
    }),
  ])

  const curRev = Number(curRevenues._sum.amount ?? 0)
  const curCost = Number(curCosts._sum.amount ?? 0)
  const curProfit = curRev - curCost
  const curMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0

  const prevRev = Number(prevRevenues._sum.amount ?? 0)
  const prevCost = Number(prevCosts._sum.amount ?? 0)
  const prevProfit = prevRev - prevCost
  const prevMargin = prevRev > 0 ? (prevProfit / prevRev) * 100 : 0

  return {
    current: {
      revenue: curRev,
      costs: curCost,
      profit: curProfit,
      margin: curMargin,
      count: curRevenues._count,
    },
    previous: { revenue: prevRev, costs: prevCost, profit: prevProfit, margin: prevMargin },
  }
}
