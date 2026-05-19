'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, parseLocalDate, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { fail, NotFoundError, runAction } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createActivity,
  findActivityById,
  markActivitiesSeenForAssignee,
  softDeleteActivity,
  updateActivity,
} from '@/server/repositories/activity-repository'
import { dispatchNotification } from '@/server/services/notification-service'

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

// Fim do dia = 23:59 SP. Horários após esse limite caem automaticamente
// para 23:59. Quando nenhum horário é informado, mantemos o meio-dia SP do
// parseLocalDate (suficiente para colocar a atividade na aba "Hoje").
const END_OF_DAY_HOUR = 23
const END_OF_DAY_MINUTE = 59

function combineDateTime(dateStr?: string | null, timeStr?: string | null): Date | null {
  if (!dateStr) return null
  const base = parseLocalDate(dateStr)
  if (!base) return null
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return base

  let [hh, mm] = timeStr.split(':').map(Number)
  if (hh > END_OF_DAY_HOUR || (hh === END_OF_DAY_HOUR && mm > END_OF_DAY_MINUTE)) {
    hh = END_OF_DAY_HOUR
    mm = END_OF_DAY_MINUTE
  }

  // Recompõe a data no fuso SP — base.setHours usaria o fuso do servidor
  // (UTC em produção) e jogaria a atividade para o dia errado.
  const zoned = toZonedTime(base, APP_TIMEZONE)
  return spDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), hh, mm, 0)
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

    const requestedAssignee = parsed.data.assignedToId || ctx.userId
    const assignedToId = await resolveAssignee(ctx, requestedAssignee)

    const due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)

    const activity = await createActivity(ctx, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: due,
      clientId: targetClientId ?? (ctx.role.startsWith('CLIENT_') ? ctx.clientId : null),
      assignedToId,
    })

    if (assignedToId && assignedToId !== ctx.userId) {
      await notifyAssignee(assignedToId, {
        activityId: activity.id,
        title: activity.title,
        dueDate: activity.dueDate,
      })
    }

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

    let assignedToId: string | null | undefined = undefined
    if (parsed.data.assignedToId !== undefined) {
      const requested = parsed.data.assignedToId
      assignedToId = requested ? await resolveAssignee(ctx, requested) : null
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
      assignedToId,
      completedAt,
    })

    // Notifica o novo responsável quando a atribuição muda para alguém
    // diferente do autor da alteração.
    if (assignedToId && assignedToId !== existing.assignedToId && assignedToId !== ctx.userId) {
      await notifyAssignee(assignedToId, {
        activityId,
        title: parsed.data.title ?? existing.title,
        dueDate: due !== undefined ? due : existing.dueDate,
      })
    }

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

// Marca atividades atribuídas ao usuário atual como vistas (some o badge
// "Nova"). Silenciosamente ignora ids que não pertencem a ele.
export async function markActivitiesSeenAction(activityIds: string[]) {
  return runAction(async () => {
    if (!Array.isArray(activityIds) || activityIds.length === 0) return null
    const ctx = await getTenantContext()
    await markActivitiesSeenForAssignee(ctx, ctx.userId, activityIds)
    return null
  })
}

export async function quickAddActivityAction(
  title: string,
  opts?: { dueDate?: string | null; assignedToId?: string | null }
) {
  if (!title.trim()) return fail('Título obrigatório')
  // Tarefa rápida: hoje, prioridade padrão, fim do dia (23:59 SP).
  const today = opts?.dueDate ?? todayInAppTz()
  const endOfDay = `${String(END_OF_DAY_HOUR).padStart(2, '0')}:${String(END_OF_DAY_MINUTE).padStart(2, '0')}`
  return createActivityAction({
    title: title.trim(),
    type: 'TASK',
    priority: 'MEDIUM',
    dueDate: today,
    dueTime: endOfDay,
    assignedToId: opts?.assignedToId ?? null,
  })
}

function todayInAppTz(): string {
  // YYYY-MM-DD no fuso da aplicação (SP), formato aceito por parseLocalDate.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

// Apenas ADMIN pode atribuir atividade a outro usuário. Os demais (STAFF /
// CLIENT_*) ficam restritos a si mesmos. O alvo precisa ser um usuário ativo
// da mesma organização, senão a atividade volta para o próprio criador.
async function resolveAssignee(
  ctx: { userId: string; organizationId: string; role: string },
  requested: string
): Promise<string> {
  if (requested === ctx.userId) return ctx.userId
  if (ctx.role !== 'ADMIN') return ctx.userId

  const target = await prisma.user.findFirst({
    where: {
      id: requested,
      organizationId: ctx.organizationId,
      isActive: true,
      deletedAt: null,
      role: { in: ['ADMIN', 'STAFF'] },
    },
    select: { id: true },
  })
  return target?.id ?? ctx.userId
}

async function notifyAssignee(
  userId: string,
  activity: { activityId: string; title: string; dueDate: Date | null }
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isActive: true, deletedAt: true },
  })
  if (!user || !user.isActive || user.deletedAt) return

  const when = activity.dueDate
    ? activity.dueDate.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  try {
    await dispatchNotification([{ userId: user.id, email: user.email, name: user.name }], {
      type: 'SYSTEM',
      title: `Nova atividade: ${activity.title}`,
      message: when
        ? `Você foi designado para "${activity.title}". Vencimento: ${when}.`
        : `Você foi designado para "${activity.title}".`,
      link: '/activities',
      metadata: { activityId: activity.activityId },
    })
  } catch (err) {
    logger.error('Activity assignment notification failed', {
      activityId: activity.activityId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
