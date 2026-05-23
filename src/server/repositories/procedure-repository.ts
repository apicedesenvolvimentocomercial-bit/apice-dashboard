import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type ProcedureForSelect = Awaited<ReturnType<typeof listProceduresForSelect>>[number]
export type ProcedureWithStats = Awaited<ReturnType<typeof listProceduresWithStats>>[number]

export async function listProceduresForSelect(ctx: TenantContext, clientId: string) {
  const rows = await prisma.procedure.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      price: true,
      cost: true,
    },
  })
  // Decimal → number p/ serializar do server p/ client component.
  return rows.map((p) => ({ ...p, price: Number(p.price), cost: Number(p.cost) }))
}

export async function listProceduresWithStats(ctx: TenantContext, clientId: string) {
  const cutoff90d = new Date()
  cutoff90d.setDate(cutoff90d.getDate() - 90)

  const rows = await prisma.procedure.findMany({
    where: { organizationId: ctx.organizationId, clientId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      cost: true,
      durationMinutes: true,
      isActive: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      revenues: {
        where: { date: { gte: cutoff90d }, deletedAt: null },
        select: { amount: true },
      },
    },
  })

  return rows.map((p) => {
    const price = Number(p.price)
    const cost = Number(p.cost)
    const margin = price > 0 ? ((price - cost) / price) * 100 : 0
    const revenueTotal90d = p.revenues.reduce((sum, r) => sum + Number(r.amount), 0)
    const countSold90d = p.revenues.length
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price,
      cost,
      margin,
      durationMinutes: p.durationMinutes,
      isActive: p.isActive,
      categoryId: p.categoryId,
      category: p.category,
      revenueTotal90d,
      countSold90d,
      pricingSuggestion: suggestPricing({ margin, countSold90d, isActive: p.isActive }),
    }
  })
}

export type PricingSuggestion = {
  level: 'critical' | 'warning' | 'opportunity' | 'ok'
  message: string
}

function suggestPricing({
  margin,
  countSold90d,
  isActive,
}: {
  margin: number
  countSold90d: number
  isActive: boolean
}): PricingSuggestion {
  if (!isActive) return { level: 'ok', message: 'Procedimento inativo' }
  if (margin < 0) {
    return { level: 'critical', message: 'Preço abaixo do custo — ajustar urgente' }
  }
  if (margin < 30) {
    return { level: 'warning', message: 'Margem baixa (<30%) — considere aumentar o preço' }
  }
  if (countSold90d >= 10 && margin >= 50) {
    return {
      level: 'opportunity',
      message: 'Alta demanda + margem boa — oportunidade de subir preço',
    }
  }
  if (countSold90d >= 5 && margin >= 40) {
    return { level: 'ok', message: 'Boa demanda e margem saudável' }
  }
  return { level: 'ok', message: 'Margem saudável' }
}

export async function findProcedureById(ctx: TenantContext, procedureId: string) {
  const p = await prisma.procedure.findFirst({
    where: { id: procedureId, organizationId: ctx.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      cost: true,
      durationMinutes: true,
      isActive: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
    },
  })
  if (!p) return null
  return { ...p, price: Number(p.price), cost: Number(p.cost) }
}

export async function createProcedure(
  ctx: TenantContext,
  clientId: string,
  data: {
    name: string
    description?: string
    price: number
    cost: number
    durationMinutes?: number
    categoryId?: string
  }
) {
  return prisma.procedure.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: data.name,
      description: data.description,
      price: data.price,
      cost: data.cost,
      durationMinutes: data.durationMinutes,
      categoryId: data.categoryId,
    },
  })
}

export async function updateProcedure(
  ctx: TenantContext,
  procedureId: string,
  data: Partial<{
    name: string
    description: string
    price: number
    cost: number
    durationMinutes: number
    isActive: boolean
    categoryId: string
  }>
) {
  return prisma.procedure.updateMany({
    where: { id: procedureId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteProcedure(ctx: TenantContext, procedureId: string) {
  return prisma.procedure.updateMany({
    where: { id: procedureId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
}

export async function listCategories(ctx: TenantContext, clientId: string) {
  return prisma.procedureCategory.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true },
  })
}
