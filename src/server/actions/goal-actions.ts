'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { ConflictError, fail, runAction } from '@/types/errors'
import { prisma } from '@/lib/prisma'
import { createGoal, softDeleteGoal, updateGoal } from '@/server/repositories/goal-repository'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'

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
const SCOPE_TYPES = ['CLINIC', 'USER', 'ROLE'] as const
const MODES = ['INDIVIDUAL', 'SHARED'] as const

const goalSchema = z.object({
  metric: z.enum(METRICS),
  period: z.enum(PERIODS),
  targetValue: z.number().positive('Valor alvo deve ser positivo'),
  startDate: z.string().min(1, 'Data inicial obrigatória'),
  endDate: z.string().min(1, 'Data final obrigatória'),
  notes: z.string().optional(),
  // Etapa 2 — escopo. Default CLINIC (coletiva) p/ retrocompatibilidade.
  scopeType: z.enum(SCOPE_TYPES).default('CLINIC'),
  mode: z.enum(MODES).default('SHARED'),
  assigneeUserId: z.string().cuid().nullish(),
  assigneeRoleId: z.string().cuid().nullish(),
})

function revalidate(clientId: string) {
  revalidatePath('/overview')
  revalidatePath('/goals')
  revalidatePath(`/clients/${clientId}/overview`)
  revalidatePath(`/clients/${clientId}/goals`)
}

export async function createGoalAction(clientId: string, formData: unknown) {
  const parsed = goalSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const startDate = parseLocalDate(parsed.data.startDate)
  const endDate = parseLocalDate(parsed.data.endDate)
  if (!startDate || !endDate) return fail('Datas inválidas')
  if (endDate.getTime() <= startDate.getTime()) return fail('Data final deve ser após a inicial')

  // Normaliza o escopo: alvo só vale para o scopeType correspondente.
  const scopeType = parsed.data.scopeType
  const assigneeUserId = scopeType === 'USER' ? (parsed.data.assigneeUserId ?? null) : null
  const assigneeRoleId = scopeType === 'ROLE' ? (parsed.data.assigneeRoleId ?? null) : null
  const mode = scopeType === 'CLINIC' ? 'SHARED' : parsed.data.mode

  if (scopeType === 'USER' && !assigneeUserId) return fail('Selecione o usuário da meta')
  if (scopeType === 'ROLE' && !assigneeRoleId) return fail('Selecione o cargo da meta')

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
    await assertCan(ctx, 'goals', 'write')

    // Delegar a OUTRO (usuário diferente de si, ou cargo, ou clínica) exige
    // assignToOthers (decisão D4). Meta só para si mesmo basta goals:write.
    const isSelfUserGoal = scopeType === 'USER' && assigneeUserId === ctx.userId
    if (!isSelfUserGoal && scopeType !== 'CLINIC') {
      await assertCan(ctx, 'goals', 'assignToOthers')
    }

    // O alvo precisa pertencer à clínica (defesa contra IDs forjados).
    if (assigneeUserId) {
      const u = await prisma.user.findFirst({
        where: { id: assigneeUserId, clientId, deletedAt: null },
        select: { id: true },
      })
      if (!u) throw new ConflictError('Usuário não pertence à clínica')
    }
    if (assigneeRoleId) {
      const r = await prisma.clinicRole.findFirst({
        where: { id: assigneeRoleId, clientId },
        select: { id: true },
      })
      if (!r) throw new ConflictError('Cargo não pertence à clínica')
    }

    await createGoal(ctx, clientId, {
      metric: parsed.data.metric,
      period: parsed.data.period,
      targetValue: parsed.data.targetValue,
      startDate,
      endDate,
      notes: parsed.data.notes,
      scopeType,
      mode,
      assigneeUserId,
      assigneeRoleId,
    })
    revalidate(clientId)
    return null
  })
}

export async function updateGoalAction(goalId: string, clientId: string, formData: unknown) {
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

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'goals', 'write')
    await updateGoal(ctx, goalId, clientId, { ...parsed.data, startDate, endDate })
    revalidate(clientId)
    return null
  })
}

export async function deleteGoalAction(goalId: string, clientId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'goals', 'delete')
    await softDeleteGoal(ctx, goalId, clientId)
    revalidate(clientId)
    return null
  })
}
