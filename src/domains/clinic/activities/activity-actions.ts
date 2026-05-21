'use server'

import { revalidatePath } from 'next/cache'
import { toZonedTime } from 'date-fns-tz'
import { z } from 'zod'

import { decideCalendarSync } from '@/lib/activity-calendar-sync'
import { APP_TIMEZONE, parseLocalDate, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getClinicContext } from '@/server/auth/clinic-context'
import { assertCan } from '@/server/auth/assert-can'
import { dispatchNotification } from '@/server/services/notification-service'
import { fail, NotFoundError, runAction } from '@/types/errors'

import {
  createClinicActivity,
  findClinicActivityById,
  listClinicBroadcastTargets,
  markClinicActivitiesSeen,
  resolveClinicAssignee,
  softDeleteClinicActivity,
  updateClinicActivity,
} from './activity-repository'
import {
  createClinicCalendarEvent,
  softDeleteClinicCalendarEventForActivity,
  syncClinicCalendarEventForActivity,
} from '../calendar/calendar-event-repository'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Server actions de Atividades do DOMÍNIO CLÍNICA (Fase 3). Tudo escopado por
 * `clientId` via `getClinicContext` + repo de clínica. Assignee e fan-out
 * "Todos" restritos a CLIENT_* da mesma clínica (§4). Sync de calendário usa o
 * repo de clínica (herda clientId). Zero compartilhamento com a action admin.
 */

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
  // 'all' = fan-out p/ toda a clínica; id = usuário específico (validado);
  // null/vazio = o próprio usuário.
  assignedToId: z.string().optional().nullable(),
  addToCalendar: z.boolean().optional(),
})

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
  const zoned = toZonedTime(base, APP_TIMEZONE)
  return spDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), hh, mm, 0)
}

function revalidateClinic() {
  revalidatePath('/atividades')
  revalidatePath('/agenda')
  revalidatePath('/overview')
}

async function shouldSyncToCalendar(userId: string, uiFlag: boolean | undefined): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityCalendarSync: true },
  })
  return decideCalendarSync(u?.activityCalendarSync ?? 'ASK', uiFlag)
}

export async function createClinicActivityAction(formData: unknown) {
  const parsed = activitySchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    const due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)
    const syncCalendar = await shouldSyncToCalendar(ctx.userId, parsed.data.addToCalendar)
    const requested = parsed.data.assignedToId

    // Fan-out "Todos" da clínica: uma cópia por usuário CLIENT_* da MESMA
    // clínica. Nunca varre a org nem inclui agência.
    if (requested === 'all') {
      const targets = await listClinicBroadcastTargets(ctx)
      if (targets.length === 0) return fail('Nenhum usuário ativo na clínica')

      const broadcastId = crypto.randomUUID()
      const created = await Promise.all(
        targets.map((u) =>
          createClinicActivity(ctx, {
            title: parsed.data.title,
            description: parsed.data.description,
            type: parsed.data.type,
            priority: parsed.data.priority,
            status: parsed.data.status,
            dueDate: due,
            assignedToId: u.id,
            broadcastId,
          })
        )
      )

      if (syncCalendar && due) {
        await Promise.all(
          created.map((a) =>
            createClinicCalendarEvent(ctx, {
              userId: a.assignedToId as string,
              title: a.title,
              startAt: due,
              activityId: a.id,
            })
          )
        )
      }

      await Promise.all(
        created
          .filter((a) => a.assignedToId && a.assignedToId !== ctx.userId)
          .map((a) =>
            notifyClinicAssignee(ctx, a.assignedToId as string, {
              activityId: a.id,
              title: a.title,
              dueDate: a.dueDate,
            })
          )
      )

      revalidateClinic()
      return { id: created[0].id, count: created.length }
    }

    const assignedToId =
      requested == null || requested === ''
        ? ctx.userId
        : await resolveClinicAssignee(ctx, requested)

    const activity = await createClinicActivity(ctx, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: due,
      assignedToId,
    })

    if (syncCalendar && due) {
      await createClinicCalendarEvent(ctx, {
        userId: assignedToId,
        title: activity.title,
        startAt: due,
        activityId: activity.id,
      })
    }

    if (assignedToId !== ctx.userId) {
      await notifyClinicAssignee(ctx, assignedToId, {
        activityId: activity.id,
        title: activity.title,
        dueDate: activity.dueDate,
      })
    }

    revalidateClinic()
    return { id: activity.id }
  })
}

export async function updateClinicActivityAction(activityId: string, formData: unknown) {
  const parsed = activitySchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findClinicActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')

    let due: Date | null | undefined = undefined
    if (parsed.data.dueDate !== undefined) {
      due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)
    }

    let assignedToId: string | null | undefined = undefined
    if (parsed.data.assignedToId !== undefined) {
      const requested = parsed.data.assignedToId
      assignedToId = requested ? await resolveClinicAssignee(ctx, requested) : null
    }

    const completedAt =
      parsed.data.status === 'COMPLETED' && existing.status !== 'COMPLETED'
        ? new Date()
        : parsed.data.status && parsed.data.status !== 'COMPLETED'
          ? null
          : undefined

    await updateClinicActivity(ctx, activityId, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: due,
      assignedToId,
      completedAt,
    })

    if (parsed.data.title !== undefined || due !== undefined) {
      await syncClinicCalendarEventForActivity(ctx, activityId, {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(due !== undefined ? { startAt: due } : {}),
      })
    }

    if (assignedToId && assignedToId !== existing.assignedToId && assignedToId !== ctx.userId) {
      await notifyClinicAssignee(ctx, assignedToId, {
        activityId,
        title: parsed.data.title ?? existing.title,
        dueDate: due !== undefined ? due : existing.dueDate,
      })
    }

    revalidateClinic()
    return null
  })
}

export async function updateClinicActivityStatusAction(
  activityId: string,
  status: (typeof STATUSES)[number]
) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    const existing = await findClinicActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')

    await updateClinicActivity(ctx, activityId, {
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    })
    revalidateClinic()
    return null
  })
}

export async function deleteClinicActivityAction(activityId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'delete')
    const existing = await findClinicActivityById(ctx, activityId)
    if (!existing) throw new NotFoundError('Atividade')
    await softDeleteClinicActivity(ctx, activityId)
    await softDeleteClinicCalendarEventForActivity(ctx, activityId)
    revalidateClinic()
    return null
  })
}

export async function quickAddClinicActivityAction(
  title: string,
  opts?: { dueDate?: string | null; assignedToId?: string | null; addToCalendar?: boolean }
) {
  if (!title.trim()) return fail('Título obrigatório')
  const today = opts?.dueDate ?? todayInAppTz()
  const endOfDay = `${String(END_OF_DAY_HOUR).padStart(2, '0')}:${String(END_OF_DAY_MINUTE).padStart(2, '0')}`
  return createClinicActivityAction({
    title: title.trim(),
    type: 'TASK',
    priority: 'MEDIUM',
    dueDate: today,
    dueTime: endOfDay,
    assignedToId: opts?.assignedToId ?? null,
    addToCalendar: opts?.addToCalendar,
  })
}

export async function markClinicActivitiesSeenAction(activityIds: string[]) {
  return runAction(async () => {
    if (!Array.isArray(activityIds) || activityIds.length === 0) return null
    const ctx = await getClinicContext()
    await markClinicActivitiesSeen(ctx, activityIds)
    return null
  })
}

function todayInAppTz(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

async function notifyClinicAssignee(
  ctx: ClinicContext,
  userId: string,
  activity: { activityId: string; title: string; dueDate: Date | null }
): Promise<void> {
  // Destinatário precisa ser da MESMA clínica (defesa extra além do resolve).
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      clientId: ctx.clientId,
      isActive: true,
      deletedAt: null,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
    },
    select: { id: true, email: true, name: true },
  })
  if (!user) return

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
    await dispatchNotification(
      [{ userId: user.id, email: user.email, name: user.name, clientId: ctx.clientId }],
      {
        type: 'SYSTEM',
        title: `Nova atividade: ${activity.title}`,
        message: when
          ? `Você foi designado para "${activity.title}". Vencimento: ${when}.`
          : `Você foi designado para "${activity.title}".`,
        link: '/atividades',
        metadata: { activityId: activity.activityId },
      }
    )
  } catch (err) {
    logger.error('Clinic activity assignment notification failed', {
      activityId: activity.activityId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
