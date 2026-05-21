import type { Metadata } from 'next'

import { ClinicActivitiesPage } from '@/components/clinic/activities/clinic-activities-page'
import { getClinicActivities } from '@/domains/clinic/activities/activity-queries'

export const metadata: Metadata = { title: 'Atividades' }

type SearchParams = { view?: string }
type Props = { searchParams: Promise<SearchParams> }

function parseView(v: string | undefined): 'today' | 'week' | 'overdue' | 'all' | 'done' {
  if (v === 'today' || v === 'week' || v === 'overdue' || v === 'all' || v === 'done') return v
  return 'today'
}

export default async function ClinicActivitiesRoute({ searchParams }: Props) {
  const sp = await searchParams
  const view = parseView(sp.view)

  // getClinicActivities usa getClinicContext — escopo clientId garantido.
  const { rows, counts } = await getClinicActivities({ view })

  return (
    <ClinicActivitiesPage
      view={view}
      counts={counts}
      activities={rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.type,
        status: r.status,
        priority: r.priority,
        dueDate: r.dueDate,
        assignedTo: r.assignedTo,
      }))}
    />
  )
}
