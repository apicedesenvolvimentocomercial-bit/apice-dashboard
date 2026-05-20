import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type CalendarEventRow = Awaited<ReturnType<typeof listCalendarEvents>>[number]

export async function listCalendarEvents(
  ctx: TenantContext,
  filters: { from: Date; to: Date; userId: string }
) {
  return prisma.calendarEvent.findMany({
    where: {
      organizationId: ctx.organizationId,
      userId: filters.userId,
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
    },
  })
}

export async function findCalendarEventById(ctx: TenantContext, id: string, userId: string) {
  return prisma.calendarEvent.findFirst({
    where: { id, organizationId: ctx.organizationId, userId, deletedAt: null },
  })
}

export async function createCalendarEvent(
  ctx: TenantContext,
  data: {
    userId: string
    title: string
    startAt: Date
    endAt?: Date | null
    notes?: string | null
    color?: string | null
    category?: string | null
    activityId?: string | null
  }
) {
  return prisma.calendarEvent.create({
    data: {
      organizationId: ctx.organizationId,
      userId: data.userId,
      title: data.title,
      startAt: data.startAt,
      endAt: data.endAt ?? null,
      notes: data.notes ?? null,
      color: data.color ?? null,
      category: data.category ?? null,
      activityId: data.activityId ?? null,
    },
  })
}

export async function updateCalendarEvent(
  ctx: TenantContext,
  id: string,
  userId: string,
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
    where: { id, organizationId: ctx.organizationId, userId, deletedAt: null },
    data,
  })
}

export async function softDeleteCalendarEvent(ctx: TenantContext, id: string, userId: string) {
  return prisma.calendarEvent.updateMany({
    where: { id, organizationId: ctx.organizationId, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

// Sincroniza o evento vinculado a uma atividade. Usado pelas actions de
// update/delete da atividade. Não falha se o evento não existir.
export async function syncCalendarEventForActivity(
  ctx: TenantContext,
  activityId: string,
  data: { title?: string; startAt?: Date | null }
) {
  const event = await prisma.calendarEvent.findUnique({
    where: { activityId },
    select: { id: true },
  })
  if (!event) return
  await prisma.calendarEvent.update({
    where: { id: event.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.startAt !== undefined && data.startAt !== null ? { startAt: data.startAt } : {}),
    },
  })
  // Mantém o ctx no parametro por consistência com as outras funções.
  void ctx
}

export async function softDeleteCalendarEventForActivity(activityId: string) {
  return prisma.calendarEvent.updateMany({
    where: { activityId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
