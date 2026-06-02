import type { CostType } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type CostRow = Awaited<ReturnType<typeof listCosts>>[number]

// Marcador de categoria p/ aluguel de equipamento — um custo FIXED recorrente que
// aparece na seção "Alugados" da aba Ativos. Entra na DRE como despesa fixa (sem
// depreciação, pois não é ativo próprio). Ver dre-progresso.md / decisão do usuário.
export const EQUIPMENT_RENTAL_CATEGORY = 'Aluguel de equipamento'

/**
 * Aluguéis de equipamento = TEMPLATES de custo FIXED recorrente com a categoria
 * dedicada. `recurringSourceId: null` filtra só os templates (não as instâncias
 * mensais geradas pelo cron de custos recorrentes).
 */
export async function listEquipmentRentals(ctx: TenantContext, clientId: string) {
  const rows = await prisma.cost.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      type: 'FIXED',
      isRecurring: true,
      recurringSourceId: null,
      category: EQUIPMENT_RENTAL_CATEGORY,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      recurringDay: true,
      createdAt: true,
    },
  })
  return rows.map((c) => ({ ...c, amount: Number(c.amount) }))
}

export async function listCosts(
  ctx: TenantContext,
  clientId: string,
  filters?: { from?: Date; to?: Date; type?: CostType }
) {
  const rows = await prisma.cost.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.type && { type: filters.type }),
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
      type: true,
      category: true,
      amount: true,
      date: true,
      description: true,
      isRecurring: true,
      recurringDay: true,
      createdAt: true,
    },
  })

  return rows.map((c) => ({ ...c, amount: Number(c.amount) }))
}

export async function createCost(
  ctx: TenantContext,
  clientId: string,
  data: {
    type: CostType
    category?: string
    amount: number
    date: Date
    description?: string
    isRecurring?: boolean
    recurringDay?: number
  }
) {
  return prisma.cost.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      type: data.type,
      category: data.category,
      amount: data.amount,
      date: data.date,
      description: data.description,
      isRecurring: data.isRecurring ?? false,
      recurringDay: data.recurringDay,
      createdById: ctx.userId,
    },
  })
}

export async function updateCost(
  ctx: TenantContext,
  costId: string,
  clientId: string,
  data: Partial<{
    type: CostType
    category: string
    amount: number
    date: Date
    description: string
    isRecurring: boolean
    recurringDay: number
  }>
) {
  // clientId no where (belt): impede editar custo de clínica-irmã da mesma org
  // mesmo se a RLS (suspenders) estiver inativa. organizationId sozinho não isola
  // entre clínicas da mesma org.
  return prisma.cost.updateMany({
    where: { id: costId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteCost(ctx: TenantContext, costId: string, clientId: string) {
  return prisma.cost.updateMany({
    where: { id: costId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
