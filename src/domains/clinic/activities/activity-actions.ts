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
import { can } from '@/server/auth/permissions'
import { dispatchNotification } from '@/server/services/notification-service'
import { fail, NotFoundError, ValidationError, runAction } from '@/types/errors'

import {
  createClinicActivity,
  createClinicActivityType,
  deleteClinicActivityType,
  findClinicActivityById,
  findClinicActivityType,
  listClinicActivitiesForTarget,
  listClinicActivityTypes,
  listClinicBroadcastTargets,
  listClinicLeadsForPicker,
  listClinicMembers,
  listClinicPatientsForPicker,
  markClinicActivitiesSeen,
  resolveClinicActivityTarget,
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

const TYPES = ['TASK', 'MEETING', 'CALL', 'EMAIL', 'NOTE', 'MESSAGE'] as const
const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

const activitySchema = z.object({
  title: z.string().min(2, 'Título obrigatório'),
  description: z.string().optional(),
  type: z.enum(TYPES),
  // Tipo personalizado da clínica (opcional). Quando presente, `type` é forçado a
  // TASK na action e a UI mostra o label custom.
  customTypeId: z.string().optional().nullable(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  // 'all' = fan-out p/ toda a clínica; id = usuário específico (validado);
  // null/vazio = o próprio usuário.
  assignedToId: z.string().optional().nullable(),
  addToCalendar: z.boolean().optional(),
  // Alvo da atividade (item 1) — obrigatório no create (atividade de clínica é
  // sempre sobre um lead OU paciente). Validado contra a clínica na action.
  targetType: z.enum(['lead', 'patient']).optional(),
  targetId: z.string().optional().nullable(),
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
  revalidatePath('/appointments') // calendário pessoal vive embutido aqui (Fase 4)
  revalidatePath('/overview')
}

async function shouldSyncToCalendar(userId: string, uiFlag: boolean | undefined): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { activityCalendarSync: true },
  })
  return decideCalendarSync(u?.activityCalendarSync ?? 'ASK', uiFlag)
}

/**
 * Pode delegar atividade a outro/fan-out? Titular sempre; senão exige
 * activities:assignToOthers (Etapa 3 / lacuna 3). Defesa server-side — a UI já
 * esconde o seletor, mas a action não confia no input.
 */
async function canAssignOthers(ctx: ClinicContext): Promise<boolean> {
  return ctx.isOwner || (await can(ctx.userId, ctx.role, 'activities', 'assignToOthers'))
}

/**
 * Resolve o tipo da atividade: se um `customTypeId` válido (da clínica) veio, usa-o
 * e força `type=TASK` (bucket genérico, sem integração nativa). Senão, tipo nativo.
 */
async function resolveActivityType(
  ctx: ClinicContext,
  type: (typeof TYPES)[number],
  customTypeId?: string | null
): Promise<{ type: (typeof TYPES)[number]; customTypeId: string | null }> {
  if (customTypeId) {
    const ct = await findClinicActivityType(ctx, customTypeId)
    if (ct) return { type: 'TASK', customTypeId: ct.id }
  }
  return { type, customTypeId: null }
}

export async function createClinicActivityAction(formData: unknown) {
  const parsed = activitySchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  // Item 1: atividade de clínica é SEMPRE sobre um lead/paciente.
  if (!parsed.data.targetType || !parsed.data.targetId) {
    return fail('Selecione o lead ou paciente da atividade')
  }

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')

    // Valida o alvo contra a clínica (belt: clientId no where) e resolve a FK.
    const target = await resolveClinicActivityTarget(
      ctx,
      parsed.data.targetType as 'lead' | 'patient',
      parsed.data.targetId as string
    )
    if (!target) throw new NotFoundError(parsed.data.targetType === 'lead' ? 'Lead' : 'Paciente')

    // Tipo personalizado: valida que pertence à clínica (belt). Se válido, `type`
    // cai em TASK (bucket sem integração nativa) e o label custom é exibido. Inválido
    // → ignora e segue com o tipo nativo escolhido.
    const { type: effectiveType, customTypeId } = await resolveActivityType(
      ctx,
      parsed.data.type,
      parsed.data.customTypeId
    )

    const due = combineDateTime(parsed.data.dueDate, parsed.data.dueTime)
    const syncCalendar = await shouldSyncToCalendar(ctx.userId, parsed.data.addToCalendar)
    // Sem permissão de delegar, ignora o alvo do input e cai no próprio usuário
    // (vale também para 'all'): a atividade vira pessoal.
    const mayAssign = await canAssignOthers(ctx)
    const requested = mayAssign ? parsed.data.assignedToId : ctx.userId

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
            type: effectiveType,
            customTypeId,
            priority: parsed.data.priority,
            status: parsed.data.status,
            dueDate: due,
            assignedToId: u.id,
            broadcastId,
            leadId: target.leadId,
            patientId: target.patientId,
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
      type: effectiveType,
      customTypeId,
      priority: parsed.data.priority,
      status: parsed.data.status,
      dueDate: due,
      assignedToId,
      leadId: target.leadId,
      patientId: target.patientId,
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
      // Sem permissão de delegar, não reatribui para outro: mantém o dono atual
      // (ou cai no próprio usuário se estava sem responsável).
      if (await canAssignOthers(ctx)) {
        assignedToId = requested ? await resolveClinicAssignee(ctx, requested) : null
      } else {
        assignedToId = existing.assignedToId ?? ctx.userId
      }
    }

    const completedAt =
      parsed.data.status === 'COMPLETED' && existing.status !== 'COMPLETED'
        ? new Date()
        : parsed.data.status && parsed.data.status !== 'COMPLETED'
          ? null
          : undefined

    // Troca de alvo (item 1) — opcional no update. Só mexe nas FKs se o caller
    // mandou targetType+targetId; valida contra a clínica antes.
    let leadId: string | null | undefined = undefined
    let patientId: string | null | undefined = undefined
    if (parsed.data.targetType && parsed.data.targetId) {
      const target = await resolveClinicActivityTarget(
        ctx,
        parsed.data.targetType,
        parsed.data.targetId
      )
      if (!target) throw new NotFoundError(parsed.data.targetType === 'lead' ? 'Lead' : 'Paciente')
      leadId = target.leadId
      patientId = target.patientId
    }

    // Tipo: custom válido → TASK + customTypeId; nativo → limpa customTypeId.
    let typeFields: { type?: (typeof TYPES)[number]; customTypeId?: string | null } = {}
    if (parsed.data.customTypeId) {
      const ct = await findClinicActivityType(ctx, parsed.data.customTypeId)
      if (ct) typeFields = { type: 'TASK', customTypeId: ct.id }
      else if (parsed.data.type) typeFields = { type: parsed.data.type, customTypeId: null }
    } else if (parsed.data.type !== undefined) {
      typeFields = { type: parsed.data.type, customTypeId: null }
    }

    await updateClinicActivity(ctx, activityId, {
      title: parsed.data.title,
      description: parsed.data.description,
      ...typeFields,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: due,
      assignedToId,
      completedAt,
      leadId,
      patientId,
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

/**
 * Listas de alvos (leads + pacientes) p/ o picker da atividade (item 1). Carregado
 * sob demanda quando o dialog abre — não pesa todo render da página de atividades.
 */
export async function listClinicActivityTargetsAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'read')
    const [leads, patients] = await Promise.all([
      listClinicLeadsForPicker(ctx),
      listClinicPatientsForPicker(ctx),
    ])
    return { leads, patients }
  })
}

/**
 * Dados da aba Atividades do CARD do cliente (item 6). Lista as atividades do
 * alvo (lead → as do lead; paciente → as dele E dos leads ligados) + os membros
 * da clínica e prefs p/ o dialog de criação (presetTarget).
 */
export async function getCardActivitiesAction(subject: { type: 'lead' | 'patient'; id: string }) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'read')

    let target: { leadId?: string; patientId?: string; leadIds?: string[] }
    if (subject.type === 'lead') {
      target = { leadId: subject.id }
    } else {
      // Paciente: também as atividades dos leads ligados a ele (continuidade).
      const leads = await prisma.lead.findMany({
        where: { patientId: subject.id, clientId: ctx.clientId, deletedAt: null },
        select: { id: true },
      })
      target = { patientId: subject.id, leadIds: leads.map((l) => l.id) }
    }

    const [rows, members, pref] = await Promise.all([
      listClinicActivitiesForTarget(ctx, target),
      listClinicMembers(ctx),
      prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { activityCalendarSync: true },
      }),
    ])
    const canAssign = await canAssignOthers(ctx)
    // Item 4: pode reatribuir o LEAD a outro usuário? (crm:assignToOthers)
    const canReassignLeads =
      ctx.isOwner || (await can(ctx.userId, ctx.role, 'crm', 'assignToOthers'))

    const activities = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      customTypeLabel: r.customType?.label ?? null,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      seenByAssigneeAt: r.seenByAssigneeAt,
      broadcastId: r.broadcastId,
      client: null,
      assignedTo: r.assignedTo,
      createdBy: r.createdBy,
      target: r.lead
        ? ({ type: 'lead', id: r.lead.id, name: r.lead.name } as const)
        : r.patient
          ? ({ type: 'patient', id: r.patient.id, name: r.patient.name } as const)
          : null,
    }))

    return {
      activities,
      members: members.map((m) => ({ id: m.id, name: m.name })),
      canAssignOthers: canAssign,
      canReassignLeads,
      syncPref: (pref?.activityCalendarSync ?? 'ASK') as 'AUTO' | 'ASK' | 'NEVER',
    }
  })
}

// --- Tipos de atividade personalizados (tabela por clínica) ---

export async function listClinicActivityTypesAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'read')
    return listClinicActivityTypes(ctx)
  })
}

export async function createClinicActivityTypeAction(label: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')
    const trimmed = (label ?? '').trim()
    if (trimmed.length < 2) throw new ValidationError('Nome do tipo muito curto')
    if (trimmed.length > 40) throw new ValidationError('Nome do tipo muito longo')
    // Único por clínica: reaproveita o existente em vez de estourar a unique.
    const existing = await prisma.clinicActivityType.findFirst({
      where: { clientId: ctx.clientId, label: trimmed },
      select: { id: true, label: true },
    })
    if (existing) return existing
    const created = await createClinicActivityType(ctx, trimmed)
    revalidateClinic()
    return created
  })
}

export async function deleteClinicActivityTypeAction(id: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')
    await deleteClinicActivityType(ctx, id)
    revalidateClinic()
    return null
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

async function notifyClinicAssignee(
  ctx: ClinicContext,
  userId: string,
  activity: { activityId: string; title: string; dueDate: Date | null }
): Promise<void> {
  // Destinatário precisa ser da MESMA clínica (membership por clientId).
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      clientId: ctx.clientId,
      isActive: true,
      deletedAt: null,
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
