import type { ActivityPriority, ActivityStatus, ActivityType, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type ActivityListFilters = {
  status?: ActivityStatus[]
  priority?: ActivityPriority[]
  type?: ActivityType[]
  clientId?: string | null
  assignedToId?: string | null
  view?: 'today' | 'week' | 'overdue' | 'all'
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
  if (filters.assignedToId !== undefined) where.assignedToId = filters.assignedToId
  if (filters.status?.length) where.status = { in: filters.status }
  if (filters.priority?.length) where.priority = { in: filters.priority }
  if (filters.type?.length) where.type = { in: filters.type }
  if (filters.search && filters.search.trim()) {
    where.title = { contains: filters.search.trim(), mode: 'insensitive' }
  }

  const now = new Date()
  if (filters.view === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    where.dueDate = { gte: start, lte: end }
  } else if (filters.view === 'week') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    end.setHours(23, 59, 59, 999)
    where.dueDate = { gte: start, lte: end }
  } else if (filters.view === 'overdue') {
    where.dueDate = { lt: now }
    where.status = { in: ['PENDING', 'IN_PROGRESS'] }
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
    },
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
      assignedToId: data.assignedToId ?? ctx.userId,
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
