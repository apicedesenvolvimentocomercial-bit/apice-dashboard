import type { Metadata } from 'next'

import { ClinicActivitiesPage } from '@/components/clinic/activities/clinic-activities-page'
import { getClinicActivitiesPage } from '@/domains/clinic/activities/activity-queries'
import type { ActivityView } from '@/components/shared/activities/types'
import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'

export const metadata: Metadata = { title: 'Atividades' }

type SearchParams = { view?: string; userId?: string }
type Props = { searchParams: Promise<SearchParams> }

function parseView(v: string | undefined): 'today' | 'week' | 'overdue' | 'all' | 'done' {
  if (v === 'today' || v === 'week' || v === 'overdue' || v === 'all' || v === 'done') return v
  return 'today'
}

export default async function ClinicAtividadesRoute({ searchParams }: Props) {
  await gateClinicTab('activities')
  const sp = await searchParams
  const view = parseView(sp.view)

  const session = await auth()
  const currentUserId = session?.user?.id ?? ''

  // Pasta padrão = pessoal (própria). ?userId=all → "Todos" (sem filtro de
  // responsável). ?userId=<id> → pasta daquele membro da clínica.
  let selectedUserId: string | null
  if (sp.userId === 'all') selectedUserId = null
  else if (sp.userId) selectedUserId = sp.userId
  else selectedUserId = currentUserId

  // getClinicActivitiesPage usa getClinicContext — escopo clientId+domain=CLINIC.
  const { rows, counts, members, syncPref } = await getClinicActivitiesPage({
    view,
    assignedToId: selectedUserId ?? undefined,
  })

  const activities: ActivityView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    seenByAssigneeAt: r.seenByAssigneeAt,
    broadcastId: r.broadcastId,
    client: null, // domínio clínica não rotula por clínica (é sempre a própria).
    assignedTo: r.assignedTo,
    createdBy: r.createdBy,
  }))

  return (
    <ClinicActivitiesPage
      activities={activities}
      counts={counts}
      view={view}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      currentUserId={currentUserId}
      selectedUserId={selectedUserId}
      activityCalendarSync={syncPref}
    />
  )
}
