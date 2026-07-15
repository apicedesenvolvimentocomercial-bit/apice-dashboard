'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { toZonedTime } from 'date-fns-tz'

import { decideCalendarSync } from '@/lib/activity-calendar-sync'
import { APP_TIMEZONE, parseLocalDate, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { fail, ForbiddenError, NotFoundError, runAction, validationFail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createActivity,
  findActivityById,
  markActivitiesSeenForAssignee,
  softDeleteActivity,
  updateActivity,
} from '@/server/repositories/activity-repository'
import {
  createCalendarEvent,
  softDeleteCalendarEventForActivity,
  syncCalendarEventForActivity,
} from '@/server/repositories/calendar-event-repository'
import { dispatchNotification } from '@/server/services/notification-service'

const TYPES = ['TASK', 'MEETING', 'CALL', 'EMAIL', 'NOTE', 'MESSAGE'] as const
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const activitySchema = z.object({
  title: z
    .string()
    .min(2, 'Título obrigatório')
    .max(255, 'titulo muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O titulo contém caracteres inválidos'
    ),
  description: z
    .string()
    .max(65535, 'Descrição muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'Descrição contém caracteres inválidos'
    )
    .optional(),
  type: z.enum(TYPES),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  // Flag vindo da UI quando pref do usuário é ASK. Se pref é AUTO, ignorado
  // (sempre adiciona). Se pref é NEVER, também ignorado (nunca adiciona).
  addToCalendar: z.boolean().optional(),
})

async function shouldSyncToCalendar(
  creatorUserId: string,
  uiFlag: boolean | undefined
): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: { activityCalendarSync: true },
  })
  return decideCalendarSync(u?.activityCalendarSync ?? 'ASK', uiFlag)
}

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
  if (!parsed.success) return validationFail(parsed.error)

  return runAction(async () => {
    const ctx = await getTenantContext()
    // Domínio admin (Fase 7): atividades da agência são exclusivas de ADMIN/STAFF.
    // A clínica usa `domains/clinic/activities` (escopo clientId+domain próprio).
    // Guard concentrado aqui substitui os branches CLIENT_* que existiam
    // espalhados ("clínica opera aqui" removida).
    if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') {
      throw new ForbiddenError('Atividades de agência: domínio admin')
    }
    await assertCan(ctx, 'activities', 'write')

    // clientId é etiqueta-CRM opcional: admin pode vincular a atividade a uma
    // clínica; null = atividade interna da agência (§2.4).
    const targetClientId = parsed.data.clientId || null
    if (targetClientId) {
      await assertClientAccess(ctx, targetClientId)
    }

    // Resolução do responsável:
    // - ADMIN com assignedToId === 'all' → fan-out: cria uma atividade por
    //   usuário ativo (ADMIN+STAFF) da org. Cada um vê na própria pasta.
    // - Sem assignedToId (null/vazio) → cai no próprio criador.
    // - assignedToId explícito → resolveAssignee valida (STAFF/CLIENT_* não
    //   podem atribuir a terceiros).
    const requested = parsed.data.assignedToId
    const due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)
    const effectiveClientId = targetClientId

    const syncCalendar = await shouldSyncToCalendar(ctx.userId, parsed.data.addToCalendar)

    if (requested === 'all') {
      if (ctx.role !== 'ADMIN') return fail('Apenas ADMIN pode atribuir para todos')

      const orgUsers = await prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          isActive: true,
          deletedAt: null,
          role: { in: ['ADMIN', 'STAFF'] },
        },
        select: { id: true },
      })
      if (orgUsers.length === 0) return fail('Nenhum usuário ativo na organização')

      // Mesmo broadcastId em todas as cópias — permite ao admin enxergar
      // o fan-out colapsado em uma linha na pasta "Todos".
      const broadcastId = crypto.randomUUID()
      const created = await Promise.all(
        orgUsers.map((u) =>
          createActivity(ctx, {
            title: parsed.data.title,
            description: parsed.data.description,
            type: parsed.data.type,
            priority: parsed.data.priority,
            status: parsed.data.status,
            dueDate: due,
            clientId: effectiveClientId,
            assignedToId: u.id,
            broadcastId,
          })
        )
      )

      // Cada cópia vira um evento no calendário do respectivo usuário quando
      // a pref do criador permite. Só cria se a atividade tem dueDate (sem
      // dueDate não tem onde encaixar no calendário).
      if (syncCalendar && due) {
        await Promise.all(
          created.map((a) =>
            createCalendarEvent(ctx, {
              userId: a.assignedToId as string,
              title: a.title,
              startAt: due,
              activityId: a.id,
            })
          )
        )
      }

      // Notifica todo mundo, exceto o próprio admin que criou.
      await Promise.all(
        created
          .filter((a) => a.assignedToId && a.assignedToId !== ctx.userId)
          .map((a) =>
            notifyAssignee(a.assignedToId as string, {
              activityId: a.id,
              title: a.title,
              dueDate: a.dueDate,
            })
          )
      )

      revalidateAll(effectiveClientId)
      return { id: created[0].id, count: created.length }
    }

    let assignedToId: string
    if (requested == null || requested === '') {
      assignedToId = ctx.userId
    } else {
      assignedToId = await resolveAssignee(ctx, requested)
    }

    const activity = await createActivity(ctx, {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: due,
      clientId: effectiveClientId,
      assignedToId,
    })

    if (syncCalendar && due) {
      await createCalendarEvent(ctx, {
        userId: assignedToId,
        title: activity.title,
        startAt: due,
        activityId: activity.id,
      })
    }

    if (assignedToId !== ctx.userId) {
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
  if (!parsed.success) return validationFail(parsed.error)

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

    // Sincroniza o evento vinculado: título e/ou data — apenas os campos que
    // mudaram. Se a atividade não tem evento, é no-op.
    if (parsed.data.title !== undefined || due !== undefined) {
      await syncCalendarEventForActivity(ctx, activityId, {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(due !== undefined ? { startAt: due } : {}),
      })
    }

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
    // Sync vinculado: apaga o evento se existir.
    await softDeleteCalendarEventForActivity(activityId)
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

// Apenas ADMIN pode atribuir atividade a outro usuário; STAFF fica restrito a
// si mesmo. O alvo precisa ser um usuário ativo (ADMIN/STAFF) da mesma
// organização, senão a atividade volta para o próprio criador.
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
      category: 'activities',
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
