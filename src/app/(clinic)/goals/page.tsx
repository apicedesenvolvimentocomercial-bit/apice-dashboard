import type { Metadata } from 'next'

import { GoalsPage } from '@/modules/goals/goals-page'
import type { GoalView } from '@/modules/goals/types'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import { can } from '@/server/auth/permissions'
import { getClinicGoals } from '@/domains/clinic/goals/goal-queries'
import { listClinicRoles, listClinicUsers } from '@/server/repositories/clinic-role-repository'

export const metadata: Metadata = { title: 'Metas' }

export default async function ClientGoalsPage() {
  const ctx = await gateClinicTab('goals')

  // Pode atribuir metas a outros? (decisão D4 — assignToOthers em goals.)
  const canAssign = ctx.isOwner || (await can(ctx.userId, ctx.role, 'goals', 'assignToOthers'))

  const [goals, users, roles] = await Promise.all([
    getClinicGoals(),
    canAssign ? listClinicUsers(ctx) : Promise.resolve([]),
    canAssign ? listClinicRoles(ctx) : Promise.resolve([]),
  ])

  return (
    <GoalsPage
      clientId={ctx.clientId}
      canAssign={canAssign}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name }))}
      goals={goals.map((g) => ({
        id: g.id,
        metric: g.metric as GoalView['metric'],
        period: g.period as GoalView['period'],
        targetValue: Number(g.targetValue),
        currentValue: g.currentValue,
        progressPct: g.progressPct,
        daysLeft: g.daysLeft,
        projectedAtPace: g.projectedAtPace,
        startDate: g.startDate,
        endDate: g.endDate,
        scopeType: g.scopeType,
        mode: g.mode,
        scopeLabel: g.scopeLabel,
        memberUserId: g.memberUserId,
        assigneeUserId: g.assigneeUserId,
        assigneeRoleId: g.assigneeRoleId,
      }))}
    />
  )
}
