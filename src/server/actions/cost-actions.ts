'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { ok, fail, validationFail } from '@/types/errors'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  createCost,
  updateCost,
  softDeleteCost,
  listEquipmentRentals,
  EQUIPMENT_RENTAL_CATEGORY,
} from '@/server/repositories/cost-repository'

const COST_TYPES = [
  'FIXED',
  'VARIABLE',
  'MARKETING',
  'PAYROLL',
  'TAX_REVENUE',
  'TAX_PROFIT',
  'COMMISSION',
  'COMMERCIAL',
  'ADMINISTRATIVE',
  'FINANCIAL_EXPENSE',
  'OTHER',
] as const

const costSchema = z.object({
  type: z.enum(COST_TYPES),
  category: z
    .string()
    .max(100, 'Categoria muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A categotia contém caracteres inválidos'
    )
    .optional(),
  amount: z.number().max(9_999_999_999.99, 'Valor muito alto').positive('Valor deve ser positivo'),
  date: z.string().min(1, 'Data obrigatória').max(30, 'Data inválida'),
  description: z
    .string()
    .max(65535, 'Descrição muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A descrição contém caracteres inválidos'
    )
    .optional(),
  isRecurring: z.boolean().optional(),
  recurringDay: z.number().int().min(1).max(31).optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath(`/clients/${clientId}/financial`)
  // Overview tem o gráfico "Receita recebida x Custos" que projeta custos
  // recorrentes — precisa invalidar quando um template muda.
  revalidatePath('/overview')
  revalidatePath(`/clients/${clientId}/overview`)
}

export async function createCostAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'financial', 'write')

  const parsed = costSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const date = parseLocalDate(parsed.data.date)
  if (!date) return fail('Data inválida')

  const cost = await createCost(ctx, clientId, {
    ...parsed.data,
    date,
  })
  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Cost',
    entityId: cost.id,
    changes: { amount: parsed.data.amount, type: parsed.data.type },
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}

export async function updateCostAction(costId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')

  const parsed = costSchema.partial().safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  let date: Date | undefined
  if (parsed.data.date) {
    const parsedDate = parseLocalDate(parsed.data.date)
    if (!parsedDate) return fail('Data inválida')
    date = parsedDate
  }

  await updateCost(ctx, costId, clientId, {
    ...parsed.data,
    date,
  })
  revalidate(clientId)
  return ok(null)
}

// --- Aluguel de equipamentos (seção "Alugados" da aba Ativos) ---

const rentalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Dê um nome ao equipamento')
    .max(255, 'Nome do ativo muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome do ativo contém caracteres inválidos'
    ),
  amount: z
    .number()
    .max(9_999_999_999.99, 'Aluguel mensal muito alto')
    .positive('Valor mensal deve ser positivo'),
  startDate: z.string().min(1, 'Data obrigatória').max(30, 'Data inválida'),
  recurringDay: z.number().int().min(1).max(31, 'dia do vencimento fora do padrão').optional(),
})

export async function listEquipmentRentalsAction(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'read')
  return ok(await listEquipmentRentals(ctx, clientId))
}

/**
 * Cria um aluguel de equipamento = custo FIXED recorrente com a categoria dedicada.
 * O cron de custos recorrentes gera a despesa mensal; a DRE a soma como despesa fixa.
 */
export async function createEquipmentRentalAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')

  const parsed = rentalSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const date = parseLocalDate(parsed.data.startDate)
  if (!date) return fail('Data inválida')

  const cost = await createCost(ctx, clientId, {
    type: 'FIXED',
    category: EQUIPMENT_RENTAL_CATEGORY,
    amount: parsed.data.amount,
    date,
    description: parsed.data.name,
    isRecurring: true,
    recurringDay: parsed.data.recurringDay ?? date.getDate(),
  })
  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Cost',
    entityId: cost.id,
    changes: { rental: parsed.data.name, amount: parsed.data.amount },
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}

export async function deleteCostAction(costId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'delete')
  await softDeleteCost(ctx, costId, clientId)
  createAuditLog(ctx, { action: 'delete', entityType: 'Cost', entityId: costId }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
