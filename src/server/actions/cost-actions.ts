'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { ok, fail } from '@/types/errors'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { createCost, updateCost, softDeleteCost } from '@/server/repositories/cost-repository'

const COST_TYPES = ['FIXED', 'VARIABLE', 'MARKETING', 'PAYROLL', 'TAX', 'OTHER'] as const

const costSchema = z.object({
  type: z.enum(COST_TYPES),
  category: z.string().optional(),
  amount: z.number().positive('Valor deve ser positivo'),
  date: z.string().min(1, 'Data obrigatória'),
  description: z.string().optional(),
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
  await assertCan(ctx, 'financial', 'write')

  const parsed = costSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

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
  await assertCan(ctx, 'financial', 'write')

  const parsed = costSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  let date: Date | undefined
  if (parsed.data.date) {
    const parsedDate = parseLocalDate(parsed.data.date)
    if (!parsedDate) return fail('Data inválida')
    date = parsedDate
  }

  await updateCost(ctx, costId, {
    ...parsed.data,
    date,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deleteCostAction(costId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'financial', 'delete')
  await softDeleteCost(ctx, costId)
  createAuditLog(ctx, { action: 'delete', entityType: 'Cost', entityId: costId }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
