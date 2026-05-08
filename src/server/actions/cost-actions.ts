'use server'

import type { CostType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
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
}

export async function createCostAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  const parsed = costSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  await createCost(ctx, clientId, {
    ...parsed.data,
    date: new Date(parsed.data.date),
  })
  revalidate(clientId)
  return ok(null)
}

export async function updateCostAction(costId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  const parsed = costSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateCost(ctx, costId, {
    ...parsed.data,
    type: parsed.data.type as CostType | undefined,
    date: parsed.data.date ? new Date(parsed.data.date) : undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deleteCostAction(costId: string, clientId: string) {
  const ctx = await getTenantContext()
  await softDeleteCost(ctx, costId)
  revalidate(clientId)
  return ok(null)
}
