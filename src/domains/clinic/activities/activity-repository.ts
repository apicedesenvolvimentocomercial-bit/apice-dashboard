import type { ActivityPriority, ActivityStatus, ActivityType, Prisma } from '@prisma/client'
import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, spDate } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Repositório de Atividades do DOMÍNIO CLÍNICA (reforma divisão total, Fase 3).
 *
 * Regra de ouro (§3.4): toda query recebe `ClinicContext` e injeta
 * `where.clientId = ctx.clientId` INCONDICIONALMENTE, ignorando qualquer
 * clientId vindo de input. Corrige o achado P0 (§1.2): o repo admin
 * (`activity-repository.ts`) filtra só por organizationId — reusá-lo para a
 * clínica vazaria atividade de toda a org. Aqui o filtro é impossível de
 * esquecer: `ClinicContext.clientId` é `string` não-nulo.
 */

export type ClinicActivityListFilters = {
  status?: ActivityStatus[]
  priority?: ActivityPriority[]
  type?: ActivityType[]
  assignedToId?: string | null
  collapseBroadcastsForUserId?: string
  view?: 'today' | 'week' | 'overdue' | 'all' | 'done'
  search?: string
}

export type ClinicActivityRow = Awaited<ReturnType<typeof listClinicActivities>>[number]

function buildClinicWhere(
  ctx: ClinicContext,
  filters: ClinicActivityListFilters = {}
): Prisma.ActivityWhereInput {
  // clientId FORÇADO da sessão — nunca de input. Esta linha é a defesa.
  const where: Prisma.ActivityWhereInput = {
    organizationId: ctx.organizationId,
    clientId: ctx.clientId,
    deletedAt: null,
  }

  if (filters.assignedToId !== undefined) where.assignedToId = filters.assignedToId
  if (filters.collapseBroadcastsForUserId) {
    where.OR = [{ broadcastId: null }, { assignedToId: filters.collapseBroadcastsForUserId }]
  }
  if (filters.priority?.length) where.priority = { in: filters.priority }
  if (filters.type?.length) where.type = { in: filters.type }
  if (filters.search && filters.search.trim()) {
    where.title = { contains: filters.search.trim(), mode: 'insensitive' }
  }

  // Janelas de data no fuso da aplicação (SP) — mesma semântica do painel admin.
  const zonedNow = toZonedTime(new Date(), APP_TIMEZONE)
  const y = zonedNow.getFullYear()
  const m = zonedNow.getMonth()
  const d = zonedNow.getDate()
  const dayStart = spDate(y, m, d, 0, 0, 0)
  const dayEnd = new Date(spDate(y, m, d + 1, 0, 0, 0).getTime() - 1)

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
    if (!filters.status?.length) {
      where.status = { in: ['PENDING', 'IN_PROGRESS', 'CANCELED'] }
    }
  } else if (filters.status?.length) {
    where.status = { in: filters.status }
  }

  return where
}

export async function listClinicActivities(
  ctx: ClinicContext,
  filters: ClinicActivityListFilters = {}
) {
  return prisma.activity.findMany({
    where: buildClinicWhere(ctx, filters),
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      assignedTo: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

export async function countClinicActivities(
  ctx: ClinicContext,
  filters: ClinicActivityListFilters = {}
) {
  return prisma.activity.count({ where: buildClinicWhere(ctx, filters) })
}

export async function findClinicActivityById(ctx: ClinicContext, activityId: string) {
  return prisma.activity.findFirst({
    where: {
      id: activityId,
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      deletedAt: null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

export async function createClinicActivity(
  ctx: ClinicContext,
  data: {
    title: string
    description?: string
    type: ActivityType
    status?: ActivityStatus
    priority?: ActivityPriority
    dueDate?: Date | null
    assignedToId?: string | null
    broadcastId?: string | null
  }
) {
  const assignedToId = data.assignedToId === undefined ? ctx.userId : data.assignedToId
  return prisma.activity.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, // FORÇADO — atividade de clínica sempre tem dono-clínica.
      title: data.title,
      description: data.description,
      type: data.type,
      status: data.status ?? 'PENDING',
      priority: data.priority ?? 'MEDIUM',
      dueDate: data.dueDate ?? null,
      assignedToId,
      broadcastId: data.broadcastId ?? null,
      createdById: ctx.userId,
    },
  })
}

export async function updateClinicActivity(
  ctx: ClinicContext,
  activityId: string,
  data: Partial<{
    title: string
    description: string
    type: ActivityType
    status: ActivityStatus
    priority: ActivityPriority
    dueDate: Date | null
    assignedToId: string | null
    completedAt: Date | null
  }>
) {
  // where inclui clientId — update só atinge atividade da própria clínica.
  return prisma.activity.updateMany({
    where: {
      id: activityId,
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      deletedAt: null,
    },
    data,
  })
}

export async function softDeleteClinicActivity(ctx: ClinicContext, activityId: string) {
  return prisma.activity.updateMany({
    where: {
      id: activityId,
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  })
}

export async function markClinicActivitiesSeen(ctx: ClinicContext, activityIds: string[]) {
  if (activityIds.length === 0) return { count: 0 }
  return prisma.activity.updateMany({
    where: {
      id: { in: activityIds },
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      assignedToId: ctx.userId,
      seenByAssigneeAt: null,
      deletedAt: null,
    },
    data: { seenByAssigneeAt: new Date() },
  })
}

/**
 * Resolve responsável de atividade de clínica: APENAS usuários CLIENT_* da
 * MESMA clínica (§4). Bloqueia atribuir a outra clínica ou à agência.
 * Cai no próprio usuário se o alvo não for elegível.
 */
export async function resolveClinicAssignee(
  ctx: ClinicContext,
  requested: string
): Promise<string> {
  if (requested === ctx.userId) return ctx.userId
  const target = await prisma.user.findFirst({
    where: {
      id: requested,
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  })
  return target?.id ?? ctx.userId
}

/**
 * Alvos do fan-out "Todos" da clínica: usuários CLIENT_* ativos da MESMA
 * clínica (§4). Nunca varre a org nem inclui ADMIN/STAFF.
 */
export async function listClinicBroadcastTargets(ctx: ClinicContext) {
  return prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true, name: true },
  })
}
