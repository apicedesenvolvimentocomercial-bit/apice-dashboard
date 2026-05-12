import type { Metadata } from 'next'

import { GoalsPage } from '@/modules/goals/goals-page'
import type { GoalView } from '@/modules/goals/types'
import { getGoalsWithProgress } from '@/server/queries/goal-queries'

export const metadata: Metadata = { title: 'Metas' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClinicGoalsPage({ params }: Props) {
  const { clientId } = await params
  const goals = await getGoalsWithProgress(clientId)
  return <GoalsPage clientId={clientId} goals={goals.map(toView)} />
}

function toView(g: Awaited<ReturnType<typeof getGoalsWithProgress>>[number]): GoalView {
  return {
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
  }
}
