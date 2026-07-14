'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, validationFail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  createProcedure,
  updateProcedure,
  softDeleteProcedure,
} from '@/server/repositories/procedure-repository'

const procedureSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  description: z.string().optional(),
  price: z
    .number()
    .max(9_999_999_999.99, 'Preço muito alto')
    .nonnegative('Preço deve ser positivo'),
  cost: z.number().max(9_999_999_999.99, 'Preço muito alto').nonnegative('Custo deve ser positivo'),
  // Tempo de procedimento de 6 horas max
  durationMinutes: z
    .number()
    .max(360, 'tempo de procedimento excede o limite')
    .int()
    .positive()
    .optional(),
  // Janela de retorno / fim do efeito (reforma da retenção). null = procedimento único.
  // max de um ano de recorrencia
  recurrenceDays: z
    .number()
    .max(365, 'impossível inserir recorrencia de mais de um ano')
    .int()
    .positive()
    .nullable()
    .optional(),
  categoryId: z.string().optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/financial`)
  revalidatePath(`/clients/${clientId}/appointments`)
}

export async function createProcedureAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'procedures', 'write')

  const parsed = procedureSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  await createProcedure(ctx, clientId, {
    ...parsed.data,
    categoryId: parsed.data.categoryId || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function updateProcedureAction(
  procedureId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'procedures', 'write')

  const parsed = procedureSchema.partial().safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  await updateProcedure(ctx, procedureId, clientId, {
    ...parsed.data,
    categoryId: parsed.data.categoryId || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function toggleProcedureActiveAction(
  procedureId: string,
  clientId: string,
  isActive: boolean
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'procedures', 'write')
  await updateProcedure(ctx, procedureId, clientId, { isActive })
  revalidate(clientId)
  return ok(null)
}

export async function deleteProcedureAction(procedureId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'procedures', 'delete')
  await softDeleteProcedure(ctx, procedureId, clientId)
  revalidate(clientId)
  return ok(null)
}
