'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { fail, ok } from '@/types/errors'
import { createGoal, softDeleteGoal, updateGoal } from '@/server/repositories/goal-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

const METRICS = [
  'REVENUE',
  'LEADS',
  'CONVERSION_RATE',
  'NO_SHOW_RATE',
  'AVERAGE_TICKET',
  'APPOINTMENTS',
  'NEW_PATIENTS',
] as const

const PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

const goalSchema = z.object({
  metric: z.enum(METRICS),
  period: z.enum(PERIODS),
  targetValue: z.number().positive('Valor alvo deve ser positivo'),
  startDate: z.string().min(1, 'Data inicial obrigatória'),
  endDate: z.string().min(1, 'Data final obrigatória'),
  notes: z.string().optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/overview')
  revalidatePath('/goals')
  revalidatePath(`/clients/${clientId}/overview`)
  revalidatePath(`/clients/${clientId}/goals`)
}

export async function createGoalAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  const parsed = goalSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const startDate = parseLocalDate(parsed.data.startDate)
  const endDate = parseLocalDate(parsed.data.endDate)
  if (!startDate || !endDate) return fail('Datas inválidas')
  if (endDate.getTime() <= startDate.getTime()) return fail('Data final deve ser após a inicial')

  await createGoal(ctx, clientId, {
    metric: parsed.data.metric,
    period: parsed.data.period,
    targetValue: parsed.data.targetValue,
    startDate,
    endDate,
    notes: parsed.data.notes,
  })
  revalidate(clientId)
  return ok(null)
}

export async function updateGoalAction(goalId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  const parsed = goalSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  let startDate: Date | undefined
  let endDate: Date | undefined
  if (parsed.data.startDate) {
    const d = parseLocalDate(parsed.data.startDate)
    if (!d) return fail('Data inicial inválida')
    startDate = d
  }
  if (parsed.data.endDate) {
    const d = parseLocalDate(parsed.data.endDate)
    if (!d) return fail('Data final inválida')
    endDate = d
  }

  await updateGoal(ctx, goalId, {
    ...parsed.data,
    startDate,
    endDate,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deleteGoalAction(goalId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await softDeleteGoal(ctx, goalId)
  revalidate(clientId)
  return ok(null)
}
