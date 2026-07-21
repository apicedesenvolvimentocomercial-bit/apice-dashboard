import type { CostType } from '@prisma/client'

import { clampDayToMonth, monthBoundsFor } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'
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

/**
 * Cria um custo PARCELADO = N custos mensais, um por mês a partir de `data.date`.
 * O total é dividido em centavos (os primeiros parcelas absorvem o resto para a
 * soma bater exatamente), e cada parcela recebe " (i/N)" na descrição. Diferente
 * de "recorrente" (template + cron indefinido): parcelamento é FINITO e concreto.
 *
 * Roda em `scopedTransaction` (RLS na mesma transação): ou cria todas ou nenhuma.
 * Retorna a 1ª parcela (âncora p/ auditoria).
 */
export async function createCostInstallments(
  ctx: TenantContext,
  clientId: string,
  data: {
    type: CostType
    category?: string
    amount: number
    date: Date
    description?: string
  },
  installments: number
) {
  const { year, month0, day } = monthBoundsFor(data.date)
  const totalCents = Math.round(data.amount * 100)
  const baseCents = Math.floor(totalCents / installments)
  const remainder = totalCents - baseCents * installments

  const rows = Array.from({ length: installments }, (_, i) => {
    const cents = baseCents + (i < remainder ? 1 : 0)
    const suffix = ` (${i + 1}/${installments})`
    const description = data.description
      ? `${data.description}${suffix}`.slice(0, 65535)
      : suffix.trim()
    return {
      organizationId: ctx.organizationId,
      clientId,
      type: data.type,
      category: data.category,
      amount: cents / 100,
      date: clampDayToMonth(year, month0 + i, day),
      description,
      isRecurring: false,
      createdById: ctx.userId,
    }
  })

  return scopedTransaction(async (tx) => {
    const first = await tx.cost.create({ data: rows[0] })
    if (rows.length > 1) await tx.cost.createMany({ data: rows.slice(1) })
    return first
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
