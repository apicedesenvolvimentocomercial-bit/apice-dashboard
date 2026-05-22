import { getCurrentGoalValue, listGoals, type GoalRow } from '@/server/repositories/goal-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export type GoalWithProgress = GoalRow & {
  currentValue: number
  progressPct: number
  daysLeft: number
  projectedAtPace: number | null
}

export async function getGoalsWithProgress(
  clientId: string,
  options?: { includePast?: boolean }
): Promise<GoalWithProgress[]> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'goals', 'read')

  const goals = await listGoals(ctx, clientId, options?.includePast ?? false)
  const now = new Date()

  return Promise.all(
    goals.map(async (g) => {
      const current = await getCurrentGoalValue(ctx, clientId, g)
      const target = Number(g.targetValue)
      const progressPct = target > 0 ? (current / target) * 100 : 0

      const totalDays = Math.max(
        1,
        Math.ceil((g.endDate.getTime() - g.startDate.getTime()) / (1000 * 60 * 60 * 24))
      )
      const daysElapsed = Math.max(
        0,
        Math.min(
          totalDays,
          Math.ceil((now.getTime() - g.startDate.getTime()) / (1000 * 60 * 60 * 24))
        )
      )
      const daysLeft = Math.max(0, totalDays - daysElapsed)

      const projectedAtPace =
        daysElapsed > 0 ? Math.round((current / daysElapsed) * totalDays) : null

      return { ...g, currentValue: current, progressPct, daysLeft, projectedAtPace }
    })
  )
}
