import type { Metadata } from 'next'

import { GoalsPage } from '@/modules/goals/goals-page'
import type { GoalView } from '@/modules/goals/types'
import { auth } from '@/server/auth'
import { getClinicGoals } from '@/domains/clinic/goals/goal-queries'

export const metadata: Metadata = { title: 'Metas' }

export default async function ClientGoalsPage() {
  const session = await auth()
  const clientId = session?.user?.clientId
  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const goals = await getClinicGoals()
  return (
    <GoalsPage
      clientId={clientId}
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
        notes: g.notes,
      }))}
    />
  )
}
