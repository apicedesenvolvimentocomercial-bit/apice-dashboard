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
  | 'PipelineStage'
  | 'UserPermission'

export type AuditLogFilters = {
  from?: Date
  to?: Date
  action?: AuditAction
  entityType?: AuditEntityType
  userId?: string
  clientId?: string
  take?: number
  skip?: number
}

// AuditLog não tem clientId. Filtro por clínica = restringe aos userId que
// pertencem àquela clínica. Resolve clientId -> lista de userId antes do where.
async function resolveClientFilter(
  ctx: TenantContext,
  filters: Pick<AuditLogFilters, 'userId' | 'clientId'>
) {
  if (!filters.clientId) {
    return filters.userId ? { userId: filters.userId } : {}
  }

  const users = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId, clientId: filters.clientId },
    select: { id: true },
  })
  let ids = users.map((u) => u.id)
  // Se também filtrar por usuário, intersecta (usuário precisa ser da clínica).
  if (filters.userId) ids = ids.filter((id) => id === filters.userId)

  // Nenhum usuário casa -> força resultado vazio.
  return { userId: { in: ids.length > 0 ? ids : ['__none__'] } }
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
  const { from, to, action, entityType, take = 50, skip = 0 } = filters

  const userFilter = await resolveClientFilter(ctx, filters)
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
    ...userFilter,
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
  ])

  const rowsWithUsers = await withUsers(rows)
  return { rows: rowsWithUsers, total }
}

export async function listAuditLogsForExport(ctx: TenantContext, filters: AuditLogFilters = {}) {
  const { from, to, action, entityType } = filters

  const userFilter = await resolveClientFilter(ctx, filters)
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...userFilter,
    },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  })

  return withUsers(rows)
}

// Opções p/ os dropdowns de filtro (usuário e clínica), escopadas à org.
export async function getAuditFilterOptions(ctx: TenantContext) {
  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.client.findMany({
      // Exclui clínicas soft-deleted (deletedAt setado) — senão uma clínica
      // apagada ainda apareceria no dropdown de filtro. Mesmo critério da
      // busca de `users` acima.
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { users, clients }
}
