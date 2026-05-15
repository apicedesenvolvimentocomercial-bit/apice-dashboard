import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'invite'
  | 'stage_change'
  | 'export'

export type AuditEntityType =
  | 'Client'
  | 'Lead'
  | 'Revenue'
  | 'Cost'
  | 'Patient'
  | 'Appointment'
  | 'Goal'
  | 'Insight'
  | 'Activity'
  | 'User'
  | 'Invitation'
  | 'Procedure'
  | 'Organization'
  | 'PipelineDeal'
  | 'UserPermission'

export type AuditLogFilters = {
  from?: Date
  to?: Date
  action?: AuditAction
  entityType?: AuditEntityType
  userId?: string
  take?: number
  skip?: number
}

export async function createAuditLog(
  ctx: TenantContext,
  data: {
    action: AuditAction
    entityType: AuditEntityType
    entityId?: string
    changes?: Record<string, unknown>
    ipAddress?: string
  }
) {
  return prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      changes: data.changes as Prisma.InputJsonValue | undefined,
      ipAddress: data.ipAddress,
    },
  })
}

async function withUsers<T extends { userId: string | null }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))]
  const users =
    ids.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true, role: true },
        })
      : []
  const userMap = new Map(users.map((u) => [u.id, u]))
  return rows.map((r) => ({
    ...r,
    user: r.userId ? (userMap.get(r.userId) ?? null) : null,
  }))
}

export async function listAuditLogs(ctx: TenantContext, filters: AuditLogFilters = {}) {
  const { from, to, action, entityType, userId, take = 50, skip = 0 } = filters

  const where = {
    organizationId: ctx.organizationId,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
  ])

  const rowsWithUsers = await withUsers(rows)
  return { rows: rowsWithUsers, total }
}

export async function listAuditLogsForExport(ctx: TenantContext, filters: AuditLogFilters = {}) {
  const { from, to, action, entityType, userId } = filters

  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  })

  return withUsers(rows)
}
