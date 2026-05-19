import type { ActivityPriority, ActivityStatus, ActivityType, Prisma } from '@prisma/client'
import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, spDate } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type ActivityListFilters = {
  status?: ActivityStatus[]
  priority?: ActivityPriority[]
  type?: ActivityType[]
  clientId?: string | null
  assignedToId?: string | null
  // Quando true e assignedToId é um id, expande o filtro para "atribuído a
  // esse usuário OU sem responsável". Usado para que STAFF na pasta "Todos"
  // veja suas atividades + as gerais da organização.
  includeUnassigned?: boolean
  view?: 'today' | 'week' | 'overdue' | 'all' | 'done'
  search?: string
}

export type ActivityRow = Awaited<ReturnType<typeof listActivities>>[number]

function buildWhere(
  ctx: TenantContext,
  filters: ActivityListFilters = {}
): Prisma.ActivityWhereInput {
  const where: Prisma.ActivityWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
  }

  if (filters.clientId !== undefined) where.clientId = filters.clientId
  if (filters.assignedToId !== undefined) {
    if (filters.includeUnassigned && typeof filters.assignedToId === 'string') {
      where.OR = [{ assignedToId: filters.assignedToId }, { assignedToId: null }]
    } else {
      where.assignedToId = filters.assignedToId
    }
  }
  if (filters.status?.length) where.status = { in: filters.status }
  if (filters.priority?.length) where.priority = { in: filters.priority }
  if (filters.type?.length) where.type = { in: filters.type }
  if (filters.search && filters.search.trim()) {
    where.title = { contains: filters.search.trim(), mode: 'insensitive' }
  }

  const now = new Date()
  // "Hoje", "Esta semana" e "Atrasadas" usam o dia de calendário no fuso da
  // aplicação (SP), não o fuso do servidor — senão num servidor UTC uma
  // atividade marcada para "amanhã" às 12h SP cai dentro da janela de "hoje"
  // do servidor e aparece na aba errada.
  const zonedNow = toZonedTime(now, APP_TIMEZONE)
  const y = zonedNow.getFullYear()
  const m = zonedNow.getMonth()
  const d = zonedNow.getDate()
  const dayStart = spDate(y, m, d, 0, 0, 0)
  const dayEnd = new Date(spDate(y, m, d + 1, 0, 0, 0).getTime() - 1)

  // "Feitas" é a única aba que mostra concluídas; as demais ficam restritas
  // a atividades em aberto para não duplicar.
  if (filters.view === 'done') {
    where.status = { in: ['COMPLETED'] }
  } else if (filters.view === 'today') {
    where.dueDate = { gte: dayStart, lte: dayEnd }
    where.status = { in: ['PENDING', 'IN_PROGRESS'] }
  } else if (filters.view === 'week') {
    const weekEnd = new Date(spDate(y, m, d + 8, 0, 0, 0).getTime() - 1)
    where.dueDate = { gte: dayStart, lte: weekEnd }
    where.status = { in: ['PENDING', 'IN_PROGRESS'] }
  } else if (filters.view === 'overdue') {
    where.dueDate = { lt: dayStart }
    where.status = { in: ['PENDING', 'IN_PROGRESS'] }
  } else if (filters.view === 'all' || filters.view === undefined) {
    // "Todas" = todas as atividades em aberto.
    if (!filters.status?.length) {
      where.status = { in: ['PENDING', 'IN_PROGRESS', 'CANCELED'] }
    }
  }

  return where
}

export async function listActivities(ctx: TenantContext, filters: ActivityListFilters = {}) {
  return prisma.activity.findMany({
    where: buildWhere(ctx, filters),
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

export async function markActivitiesSeenForAssignee(
  ctx: TenantContext,
  assigneeId: string,
  activityIds: string[]
) {
  if (activityIds.length === 0) return { count: 0 }
  return prisma.activity.updateMany({
    where: {
      id: { in: activityIds },
      organizationId: ctx.organizationId,
      assignedToId: assigneeId,
      seenByAssigneeAt: null,
      deletedAt: null,
    },
    data: { seenByAssigneeAt: new Date() },
  })
}

export async function countActivities(ctx: TenantContext, filters: ActivityListFilters = {}) {
  return prisma.activity.count({ where: buildWhere(ctx, filters) })
}

export async function findActivityById(ctx: TenantContext, activityId: string) {
  return prisma.activity.findFirst({
    where: { id: activityId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

export async function createActivity(
  ctx: TenantContext,
  data: {
    title: string
    description?: string
    type: ActivityType
    status?: ActivityStatus
    priority?: ActivityPriority
    dueDate?: Date | null
    clientId?: string | null
    assignedToId?: string | null
  }
) {
  // `undefined` significa "não especificado" — cai no usuário atual.
  // `null` explícito significa "sem responsável" (atividade geral, só aparece
  // em Todos). Quem decide entre os dois é o caller (createActivityAction).
  const assignedToId = data.assignedToId === undefined ? ctx.userId : data.assignedToId
  return prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      title: data.title,
      description: data.description,
      type: data.type,
      status: data.status ?? 'PENDING',
      priority: data.priority ?? 'MEDIUM',
      dueDate: data.dueDate ?? null,
      clientId: data.clientId ?? null,
      assignedToId,
      createdById: ctx.userId,
    },
  })
}

export async function updateActivity(
  ctx: TenantContext,
  activityId: string,
  data: Partial<{
    title: string
    description: string
    type: ActivityType
    status: ActivityStatus
    priority: ActivityPriority
    dueDate: Date | null
    clientId: string | null
    assignedToId: string | null
    completedAt: Date | null
  }>
) {
  return prisma.activity.updateMany({
    where: { id: activityId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteActivity(ctx: TenantContext, activityId: string) {
  return prisma.activity.updateMany({
    where: { id: activityId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function findDueActivities(now: Date, windowHours = 24) {
  const upper = new Date(now.getTime() + windowHours * 60 * 60 * 1000)
  return prisma.activity.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { gte: now, lte: upper },
      assignedToId: { not: null },
    },
    include: {
      assignedTo: { select: { id: true, email: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  })
}

export async function findOverdueActivities(now: Date) {
  return prisma.activity.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { lt: now },
      assignedToId: { not: null },
    },
    include: {
      assignedTo: { select: { id: true, email: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  })
}
