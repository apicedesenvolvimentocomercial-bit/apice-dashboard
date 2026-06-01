import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Repositório de Calendário do DOMÍNIO CLÍNICA (reforma divisão total, Fase 4).
 *
 * Eventos de clínica gravam `clientId` (= ctx.clientId) e toda leitura escopa
 * por ele (§3.4). O calendário continua sendo por usuário (`userId`), mas o
 * escopo de domínio é garantido por `clientId` — um CLIENT_* só enxerga
 * eventos da própria clínica. O sync Activity↔CalendarEvent herda o clientId
 * da atividade (criação sempre via createClinicCalendarEvent).
 */

export type ClinicCalendarEventRow = Awaited<ReturnType<typeof listClinicCalendarEvents>>[number]

export async function listClinicCalendarEvents(
  ctx: ClinicContext,
  filters: { from: Date; to: Date; userId?: string }
) {
  return prisma.calendarEvent.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, // FORÇADO — escopo de domínio.
      ...(filters.userId ? { userId: filters.userId } : {}),
      deletedAt: null,
      startAt: { gte: filters.from, lte: filters.to },
    },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      notes: true,
      color: true,
      category: true,
      activityId: true,
      recurrenceGroupId: true,
      userId: true,
    },
  })
}

export async function findClinicCalendarEventById(ctx: ClinicContext, id: string) {
  return prisma.calendarEvent.findFirst({
    where: { id, organizationId: ctx.organizationId, clientId: ctx.clientId, deletedAt: null },
  })
}

export async function createClinicCalendarEvent(
  ctx: ClinicContext,
  data: {
    userId: string
    title: string
    startAt: Date
    endAt?: Date | null
    notes?: string | null
    color?: string | null
    category?: string | null
    activityId?: string | null
    recurrenceGroupId?: string | null
  }
) {
  return prisma.calendarEvent.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, // FORÇADO — evento de clínica sempre tem clientId.
      userId: data.userId,
      title: data.title,
      startAt: data.startAt,
      endAt: data.endAt ?? null,
      notes: data.notes ?? null,
      color: data.color ?? null,
      category: data.category ?? null,
      activityId: data.activityId ?? null,
      recurrenceGroupId: data.recurrenceGroupId ?? null,
    },
  })
}

/**
 * Cria uma SÉRIE de eventos recorrentes (item 7) numa só ida ao banco. Todas as
 * ocorrências compartilham `recurrenceGroupId` p/ exclusão em massa. `clientId`
 * e `organizationId` FORÇADOS do contexto.
 */
export async function createClinicCalendarEventSeries(
  ctx: ClinicContext,
  base: {
    userId: string
    title: string
    notes?: string | null
    color?: string | null
    category?: string | null
    recurrenceGroupId: string
  },
  occurrences: { startAt: Date; endAt: Date | null }[]
) {
  return prisma.calendarEvent.createMany({
    data: occurrences.map((o) => ({
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      userId: base.userId,
      title: base.title,
      startAt: o.startAt,
      endAt: o.endAt,
      notes: base.notes ?? null,
      color: base.color ?? null,
      category: base.category ?? null,
      recurrenceGroupId: base.recurrenceGroupId,
    })),
  })
}

/** Exclui (soft) TODA a série recorrente de uma clínica. */
export async function softDeleteClinicCalendarEventSeries(
  ctx: ClinicContext,
  recurrenceGroupId: string
) {
  return prisma.calendarEvent.updateMany({
    where: {
      recurrenceGroupId,
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  })
}

export async function updateClinicCalendarEvent(
  ctx: ClinicContext,
  id: string,
  data: Partial<{
    title: string
    startAt: Date
    endAt: Date | null
    notes: string | null
    color: string | null
    category: string | null
  }>
) {
  return prisma.calendarEvent.updateMany({
    where: { id, organizationId: ctx.organizationId, clientId: ctx.clientId, deletedAt: null },
    data,
  })
}

export async function softDeleteClinicCalendarEvent(ctx: ClinicContext, id: string) {
  return prisma.calendarEvent.updateMany({
    where: { id, organizationId: ctx.organizationId, clientId: ctx.clientId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

/**
 * Sync do evento ligado a uma atividade da clínica. Escopo por clientId
 * garante que o sync nunca cruza domínio (atividade de clínica nunca toca
 * evento de outra clínica/agência).
 */
export async function syncClinicCalendarEventForActivity(
  ctx: ClinicContext,
  activityId: string,
  data: { title?: string; startAt?: Date | null }
) {
  const event = await prisma.calendarEvent.findFirst({
    where: { activityId, clientId: ctx.clientId, deletedAt: null },
    select: { id: true },
  })
  if (!event) return
  await prisma.calendarEvent.updateMany({
    where: { id: event.id, clientId: ctx.clientId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.startAt !== undefined && data.startAt !== null ? { startAt: data.startAt } : {}),
    },
  })
}

export async function softDeleteClinicCalendarEventForActivity(
  ctx: ClinicContext,
  activityId: string
) {
  return prisma.calendarEvent.updateMany({
    where: { activityId, clientId: ctx.clientId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
