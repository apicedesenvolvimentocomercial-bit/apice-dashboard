'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { fail, NotFoundError, runAction } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createActivity,
  findActivityById,
  softDeleteActivity,
  updateActivity,
} from '@/server/repositories/activity-repository'

const TYPES = ['TASK', 'MEETING', 'CALL', 'EMAIL', 'NOTE'] as const
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const activitySchema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().optional(),
  type: z.enum(TYPES),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
})

function revalidateAll(clientId?: string | null) {
  revalidatePath('/activities')
  revalidatePath('/calendar')
  revalidatePath('/dashboard')
  if (clientId) {
    revalidatePath(`/clients/${clientId}/overview`)
  }
}

function combineDateTime(dateStr?: string | null, timeStr?: string | null): Date | null {
  if (!dateStr) return null
  const base = parseLocalDate(dateStr)
  if (!base) return null
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
    const [hh, mm] = timeStr.split(':').map(Number)
    base.setHours(hh, mm, 0, 0)
  }
  return base
}

export async function createActivityAction(formData: unknown) {
  const parsed = activitySchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'write')

    const targetClientId = parsed.data.clientId || null
    if (targetClientId) {
      await assertClientAccess(ctx, targetClientId)
    } else if (ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF') {
      // Cliente nunca cria atividade global da org.
      return fail('Atividade precisa estar vinculada à clínica')
    }

    const due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)

    const activity = await createActivity(ctx, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: due,
      clientId: targetClientId ?? (ctx.role.startsWith('CLIENT_') ? ctx.clientId : null),
      assignedToId: parsed.data.assignedToId || ctx.userId,
    })
    revalidateAll(activity.clientId)
    return { id: activity.id }
  })
}

export async function updateActivityAction(activityId: string, formData: unknown) {
  const parsed = activitySchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')

    if (parsed.data.clientId) {
      await assertClientAccess(ctx, parsed.data.clientId)
    }

    let due: Date | null | undefined = undefined
    if (parsed.data.dueDate !== undefined) {
      due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)
    }

    const completedAt =
      parsed.data.status === 'COMPLETED' && existing.status !== 'COMPLETED'
        ? new Date()
        : parsed.data.status && parsed.data.status !== 'COMPLETED'
          ? null
          : undefined

    await updateActivity(ctx, activityId, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: due,
      clientId: parsed.data.clientId,
      assignedToId: parsed.data.assignedToId,
      completedAt,
    })
    revalidateAll(existing.clientId)
    return null
  })
}

export async function updateActivityStatusAction(
  activityId: string,
  status: (typeof STATUSES)[number]
) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')

    await updateActivity(ctx, activityId, {
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    })
    revalidateAll(existing.clientId)
    return null
  })
}

export async function deleteActivityAction(activityId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'activities', 'delete')
    const existing = await findActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')
    await softDeleteActivity(ctx, activityId)
    revalidateAll(existing.clientId)
    return null
  })
}

export async function quickAddActivityAction(title: string, dueDate?: string | null) {
  if (!title.trim()) return fail('Título obrigatório')
  return createActivityAction({
    title: title.trim(),
    type: 'TASK',
    priority: 'MEDIUM',
    dueDate: dueDate ?? null,
  })
}
