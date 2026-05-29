import type { GoalMetric, GoalMode, GoalPeriod, GoalScopeType } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type GoalRow = Awaited<ReturnType<typeof listGoals>>[number]

export async function listGoals(ctx: TenantContext, clientId: string, includePast = false) {
  return prisma.goal.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(includePast ? {} : { endDate: { gte: new Date() } }),
    },
    orderBy: { endDate: 'asc' },
  })
}

export async function findGoalById(ctx: TenantContext, clientId: string, goalId: string) {
  return prisma.goal.findFirst({
    where: { id: goalId, clientId, organizationId: ctx.organizationId, deletedAt: null },
  })
}

export async function createGoal(
  ctx: TenantContext,
  clientId: string,
  data: {
    metric: GoalMetric
    period: GoalPeriod
    targetValue: number
    startDate: Date
    endDate: Date
    notes?: string
    scopeType?: GoalScopeType
    mode?: GoalMode
    assigneeUserId?: string | null
    assigneeRoleId?: string | null
  }
) {
  return prisma.goal.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      ...data,
    },
  })
}

export async function updateGoal(
  ctx: TenantContext,
  goalId: string,
  clientId: string,
  data: Partial<{
    metric: GoalMetric
    period: GoalPeriod
    targetValue: number
    startDate: Date
    endDate: Date
    notes: string
  }>
) {
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.goal.updateMany({
    where: { id: goalId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteGoal(ctx: TenantContext, goalId: string, clientId: string) {
  return prisma.goal.updateMany({
    where: { id: goalId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

/**
 * Progresso atual de uma meta. Com `assigneeUserId` (escopo USER individual), o
 * progresso é medido pelo AUTOR do registro (Etapa 2 — decisão: usar o autor):
 *   REVENUE → Revenue.createdById · LEADS → Lead.assignedToId ·
 *   APPOINTMENTS → Appointment.createdById · NEW_PATIENTS → Patient.createdById.
 * Sem `assigneeUserId`, mede o total da clínica (metas CLINIC ou SHARED).
 */
export async function getCurrentGoalValue(
  ctx: TenantContext,
  clientId: string,
  goal: { metric: string; startDate: Date; endDate: Date },
  assigneeUserId?: string | null
): Promise<number> {
  const range = { gte: goal.startDate, lte: goal.endDate }
  const base = { organizationId: ctx.organizationId, clientId, deletedAt: null }
  // Filtro por autor — coluna varia por métrica.
  const byUser = (col: 'createdById' | 'assignedToId') =>
    assigneeUserId ? { [col]: assigneeUserId } : {}

  switch (goal.metric) {
    case 'REVENUE': {
      const r = await prisma.revenue.aggregate({
        where: { ...base, date: range, ...byUser('createdById') },
        _sum: { amount: true },
      })
      return Number(r._sum.amount ?? 0)
    }
    case 'LEADS':
      return prisma.lead.count({
        where: { ...base, createdAt: range, ...byUser('assignedToId') },
      })
    case 'APPOINTMENTS':
      return prisma.appointment.count({
        where: { ...base, scheduledAt: range, ...byUser('createdById') },
      })
    case 'NEW_PATIENTS':
      return prisma.patient.count({
        where: { ...base, createdAt: range, ...byUser('createdById') },
      })
    case 'CONVERSION_RATE':
    case 'NO_SHOW_RATE':
    case 'AVERAGE_TICKET':
      // Métricas derivadas requerem aggregator dedicado; deixamos 0 (UI mostra —).
      return 0
    default:
      return 0
  }
}
