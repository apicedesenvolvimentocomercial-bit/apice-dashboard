import {
  listActivities,
  countActivities,
  findActivityById,
  type ActivityListFilters,
} from '@/server/repositories/activity-repository'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { prisma } from '@/lib/prisma'

export type ActivityListRow = Awaited<ReturnType<typeof getActivitiesForTenant>>['rows'][number]

export async function getActivitiesForTenant(filters: ActivityListFilters = {}) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'activities', 'read')

  const effective: ActivityListFilters = { ...filters }
  if (ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF') {
    if (!ctx.clientId)
      return { rows: [], counts: { today: 0, week: 0, overdue: 0, all: 0, done: 0 } }
    effective.clientId = ctx.clientId
  } else if (filters.clientId) {
    await assertClientAccess(ctx, filters.clientId)
  }

  // Per-user scoping:
  // - ADMIN pode filtrar por usuário (pasta) via filters.assignedToId; sem
  //   filtro, vê todas as atividades da organização.
  // - STAFF nunca enxerga atividades de outros. Na pasta "Todos" (sem filtro
  //   ou filtro para outro usuário) vê suas próprias + as sem responsável;
  //   na própria pasta (assignedToId === ctx.userId) vê só as próprias.
  if (ctx.role === 'STAFF') {
    const ownFolder = filters.assignedToId === ctx.userId
    effective.assignedToId = ctx.userId
    effective.includeUnassigned = !ownFolder
  }

  const [rows, today, week, overdue, all, done] = await Promise.all([
    listActivities(ctx, effective),
    countActivities(ctx, { ...effective, view: 'today' }),
    countActivities(ctx, { ...effective, view: 'week' }),
    countActivities(ctx, { ...effective, view: 'overdue' }),
    countActivities(ctx, { ...effective, view: 'all' }),
    countActivities(ctx, { ...effective, view: 'done' }),
  ])

  return {
    rows,
    counts: { today, week, overdue, all, done },
  }
}

export async function getActivityById(activityId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'activities', 'read')
  return findActivityById(ctx, activityId)
}

export async function listOrgUsers(): Promise<{ id: string; name: string; email: string }[]> {
  const ctx = await getTenantContext()
  // STAFF e papéis de clínica só podem atribuir atividades a si mesmos.
  // Apenas ADMIN enxerga toda a equipe (e pode alocar nas pastas dos demais).
  if (ctx.role !== 'ADMIN') {
    return prisma.user.findMany({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true },
    })
  }
  return prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId,
      isActive: true,
      deletedAt: null,
      role: { in: ['ADMIN', 'STAFF'] },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true },
  })
}

export async function listOrgClients(): Promise<{ id: string; name: string }[]> {
  const ctx = await getTenantContext()
  if (ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF') {
    if (!ctx.clientId) return []
    const c = await prisma.client.findFirst({
      where: { id: ctx.clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true },
    })
    return c ? [c] : []
  }
  return prisma.client.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })
}
