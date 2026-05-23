import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { monthKey, shortMonthLabel, spDate } from '@/lib/date'
import type { TenantContext } from '@/server/tenant/context'
import { currentClientId, runOutsideClientScope } from '@/server/tenant/client-scope'

export type RevenueRow = Awaited<ReturnType<typeof listRevenues>>[number]

/**
 * Transação interativa segura sob escopo de clínica (footgun #2 de
 * `rls-gambiarra.md`): sob clínica, a extensão de RLS embrulharia CADA op de
 * modelo em seu próprio `$transaction` → transação aninhada → erro. Aqui limpamos
 * o escopo (extensão passa direto) e setamos a GUC `app.current_client_id`
 * manualmente como 1ª instrução, mantendo a RLS enforçando dentro da transação.
 */
function scopedTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const scoped = currentClientId()
  return runOutsideClientScope(() =>
    prisma.$transaction(async (tx) => {
      if (scoped) {
        await tx.$executeRaw`SELECT set_config('app.current_client_id', ${scoped}, true)`
      }
      return fn(tx)
    })
  )
}

export async function listRevenues(
  ctx: TenantContext,
  clientId: string,
  filters?: {
    from?: Date
    to?: Date
    paymentMethod?: string
    patientId?: string
    procedureId?: string
  }
) {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters?.patientId ? { patientId: filters.patientId } : {}),
      ...(filters?.procedureId ? { procedureId: filters.procedureId } : {}),
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
      procedures: {
        select: {
          procedureId: true,
          price: true,
          procedure: { select: { name: true } },
        },
      },
    },
  })

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    procedures: r.procedures.map((p) => ({
      procedureId: p.procedureId,
      name: p.procedure.name,
      price: Number(p.price),
    })),
  }))
}

// Item de procedimento usado ao criar/editar uma receita.
export type RevenueProcedureInput = {
  procedureId: string
  name: string
  price: number
  cost: number
}

const PROCEDURE_COST_CATEGORY = 'Procedimento'

// Monta as linhas de Cost (uma por procedimento). Custo nunca é parcelado.
function buildProcedureCostRows(
  ctx: TenantContext,
  clientId: string,
  date: Date,
  revenueId: string,
  procedures: RevenueProcedureInput[]
) {
  return procedures
    .filter((p) => p.cost > 0)
    .map((p) => ({
      organizationId: ctx.organizationId,
      clientId,
      revenueId,
      type: 'VARIABLE' as const,
      category: PROCEDURE_COST_CATEGORY,
      amount: p.cost,
      date,
      description: p.name,
      isRecurring: false,
      createdById: ctx.userId,
    }))
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
    procedures?: RevenueProcedureInput[]
  }
) {
  const procedures = data.procedures ?? []
  // procedureId scalar = primeiro procedimento (mantém compat com filtros/relatórios).
  const primaryProcedureId = data.procedureId ?? procedures[0]?.procedureId

  return scopedTransaction(async (tx) => {
    const revenue = await tx.revenue.create({
      data: {
        organizationId: ctx.organizationId,
        clientId,
        amount: data.amount,
        date: data.date,
        description: data.description,
        paymentMethod: data.paymentMethod,
        installments: data.installments ?? 1,
        patientId: data.patientId,
        procedureId: primaryProcedureId,
        createdById: ctx.userId,
        procedures: {
          create: procedures.map((p) => ({
            clientId,
            procedureId: p.procedureId,
            price: p.price,
            cost: p.cost,
          })),
        },
      },
    })

    const costRows = buildProcedureCostRows(ctx, clientId, data.date, revenue.id, procedures)
    if (costRows.length > 0) {
      await tx.cost.createMany({ data: costRows })
    }

    return revenue
  })
}

export async function createRevenuesBulk(
  ctx: TenantContext,
  clientId: string,
  rows: {
    amount: number
    date: Date
    description?: string
    paymentMethod?: string
    installments?: number
    patientId?: string
    procedureId?: string
  }[]
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 }
  return prisma.revenue.createMany({
    data: rows.map((r) => ({
      organizationId: ctx.organizationId,
      clientId,
      amount: r.amount,
      date: r.date,
      description: r.description,
      paymentMethod: r.paymentMethod,
      installments: r.installments ?? 1,
      patientId: r.patientId,
      procedureId: r.procedureId,
      createdById: ctx.userId,
    })),
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
  }>,
  procedures?: RevenueProcedureInput[]
) {
  // Sem mudança de procedimentos: update simples dos campos escalares.
  if (!procedures) {
    return prisma.revenue.updateMany({
      where: { id: revenueId, organizationId: ctx.organizationId, deletedAt: null },
      data,
    })
  }

  // Com procedimentos: re-sincroniza itens e custos vinculados numa transação.
  const primaryProcedureId = data.procedureId ?? procedures[0]?.procedureId
  const date = data.date ?? new Date()

  return scopedTransaction(async (tx) => {
    const updated = await tx.revenue.updateMany({
      where: { id: revenueId, organizationId: ctx.organizationId, deletedAt: null },
      data: { ...data, procedureId: primaryProcedureId },
    })
    if (updated.count === 0) return updated

    // Apaga itens e custos antigos, recria do estado novo.
    await tx.revenueProcedure.deleteMany({ where: { revenueId } })
    await tx.cost.updateMany({
      where: { revenueId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (procedures.length > 0) {
      const rev = await tx.revenue.findUnique({
        where: { id: revenueId },
        select: { clientId: true },
      })
      if (rev) {
        await tx.revenueProcedure.createMany({
          data: procedures.map((p) => ({
            clientId: rev.clientId,
            revenueId,
            procedureId: p.procedureId,
            price: p.price,
            cost: p.cost,
          })),
        })
        const costRows = buildProcedureCostRows(ctx, rev.clientId, date, revenueId, procedures)
        if (costRows.length > 0) await tx.cost.createMany({ data: costRows })
      }
    }
    return updated
  })
}

export async function softDeleteRevenue(ctx: TenantContext, revenueId: string) {
  const now = new Date()
  return scopedTransaction(async (tx) => {
    const result = await tx.revenue.updateMany({
      where: { id: revenueId, organizationId: ctx.organizationId, deletedAt: null },
      data: { deletedAt: now },
    })
    // Soft-delete dos custos de procedimento gerados por esta receita.
    await tx.cost.updateMany({
      where: { revenueId, organizationId: ctx.organizationId, deletedAt: null },
      data: { deletedAt: now },
    })
    return result
  })
}

export async function getMonthlyRevenueCostData(
  ctx: TenantContext,
  clientId: string,
  months: number = 12
) {
  const now = new Date()
  const { year, month0 } = (() => {
    const k = monthKey(now)
    const [y, m] = k.split('-').map(Number)
    return { year: y, month0: m - 1 }
  })()

  const from = spDate(year, month0 - (months - 1), 1)

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

  const buckets = new Map<string, { revenue: number; costs: number; label: string }>()
  for (let i = months - 1; i >= 0; i--) {
    const firstOfBucket = spDate(year, month0 - i, 1)
    const key = monthKey(firstOfBucket)
    buckets.set(key, { revenue: 0, costs: 0, label: shortMonthLabel(firstOfBucket) })
  }

  for (const r of revenues) {
    const key = monthKey(r.date)
    const bucket = buckets.get(key)
    if (bucket) bucket.revenue += Number(r.amount)
  }
  for (const c of costs) {
    const key = monthKey(c.date)
    const bucket = buckets.get(key)
    if (bucket) bucket.costs += Number(c.amount)
  }

  return Array.from(buckets.values()).map(({ label, revenue, costs }) => ({
    month: label,
    revenue,
    costs,
  }))
}

export async function getTopProceduresByRevenue(
  ctx: TenantContext,
  clientId: string,
  options?: { from?: Date; to?: Date; limit?: number }
) {
  const limit = options?.limit ?? 5
  const grouped = await prisma.revenue.groupBy({
    by: ['procedureId'],
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      procedureId: { not: null },
      ...(options?.from || options?.to
        ? {
            date: {
              ...(options?.from ? { gte: options.from } : {}),
              ...(options?.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: limit,
  })

  const ids = grouped.map((g) => g.procedureId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []
  const procedures = await prisma.procedure.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  const map = new Map(procedures.map((p) => [p.id, p.name]))
  return grouped.map((g) => ({
    procedureId: g.procedureId,
    name: g.procedureId ? (map.get(g.procedureId) ?? 'Desconhecido') : 'Sem procedimento',
    total: Number(g._sum.amount ?? 0),
    count: g._count._all,
  }))
}

export async function getTopCostCategories(
  ctx: TenantContext,
  clientId: string,
  options?: { from?: Date; to?: Date; limit?: number }
) {
  const limit = options?.limit ?? 5
  const grouped = await prisma.cost.groupBy({
    by: ['type', 'category'],
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(options?.from || options?.to
        ? {
            date: {
              ...(options?.from ? { gte: options.from } : {}),
              ...(options?.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
  })

  return grouped
    .map((g) => ({
      type: g.type,
      category: g.category,
      label: g.category && g.category.trim().length > 0 ? g.category : g.type,
      total: Number(g._sum.amount ?? 0),
      count: g._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export async function getFinancialSummary(ctx: TenantContext, clientId: string) {
  const now = new Date()
  const [yStr, mStr] = monthKey(now).split('-')
  const year = Number(yStr)
  const month0 = Number(mStr) - 1

  const startOfMonth = spDate(year, month0, 1)
  const startOfLastMonth = spDate(year, month0 - 1, 1)
  const endOfLastMonth = new Date(startOfMonth.getTime() - 1)

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
