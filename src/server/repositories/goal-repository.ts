import type { GoalMetric, GoalPeriod } from '@prisma/client'

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

export async function findGoalById(ctx: TenantContext, goalId: string) {
  return prisma.goal.findFirst({
    where: { id: goalId, organizationId: ctx.organizationId, deletedAt: null },
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
  data: Partial<{
    metric: GoalMetric
    period: GoalPeriod
    targetValue: number
    startDate: Date
    endDate: Date
    notes: string
  }>
) {
  return prisma.goal.updateMany({
    where: { id: goalId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteGoal(ctx: TenantContext, goalId: string) {
  return prisma.goal.updateMany({
    where: { id: goalId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function getCurrentGoalValue(
  ctx: TenantContext,
  clientId: string,
  goal: { metric: string; startDate: Date; endDate: Date }
): Promise<number> {
  const range = { gte: goal.startDate, lte: goal.endDate }
  switch (goal.metric) {
    case 'REVENUE': {
      const r = await prisma.revenue.aggregate({
        where: { organizationId: ctx.organizationId, clientId, deletedAt: null, date: range },
        _sum: { amount: true },
      })
      return Number(r._sum.amount ?? 0)
    }
    case 'LEADS':
      return prisma.lead.count({
        where: { organizationId: ctx.organizationId, clientId, deletedAt: null, createdAt: range },
      })
    case 'APPOINTMENTS':
      return prisma.appointment.count({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          scheduledAt: range,
        },
      })
    case 'NEW_PATIENTS':
      return prisma.patient.count({
        where: { organizationId: ctx.organizationId, clientId, deletedAt: null, createdAt: range },
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
