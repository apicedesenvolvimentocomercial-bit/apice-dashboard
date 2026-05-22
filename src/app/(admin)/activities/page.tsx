import type { Metadata } from 'next'

import { ActivitiesPage } from '@/modules/activities/activities-page'
import type { ActivityView } from '@/components/shared/activities/types'
import { prisma } from '@/lib/prisma'
import {
  getActivitiesForTenant,
  listOrgClients,
  listOrgUsers,
} from '@/server/queries/activity-queries'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Atividades' }

type SearchParams = { view?: string; userId?: string }
type Props = { searchParams: Promise<SearchParams> }

function parseView(v: string | undefined): 'today' | 'week' | 'overdue' | 'all' | 'done' {
  if (v === 'today' || v === 'week' || v === 'overdue' || v === 'all' || v === 'done') return v
  return 'today'
}

export default async function AdminActivitiesPage({ searchParams }: Props) {
  const sp = await searchParams
  const view = parseView(sp.view)

  const ctx = await getTenantContext()
  const isAdmin = ctx.role === 'ADMIN'

  // STAFF: sempre fixado em si mesmo (query força isso).
  // Admin: pasta padrão (sem param) é a PESSOAL; "Todos" é explícito via
  // ?userId=all; ?userId=<id> abre a pasta daquele usuário.
  let selectedUserId: string | null
  if (!isAdmin) {
    selectedUserId = null
  } else if (sp.userId === 'all') {
    selectedUserId = null
  } else if (sp.userId) {
    selectedUserId = sp.userId
  } else {
    selectedUserId = ctx.userId
  }

  const [{ rows, counts }, users, clients, syncPrefRow] = await Promise.all([
    getActivitiesForTenant({ view, assignedToId: selectedUserId ?? undefined }),
    listOrgUsers(),
    listOrgClients(),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { activityCalendarSync: true },
    }),
  ])
  const syncPref = syncPrefRow?.activityCalendarSync ?? 'ASK'

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
    client: r.client,
    assignedTo: r.assignedTo,
    createdBy: r.createdBy,
  }))

  return (
    <ActivitiesPage
      activities={activities}
      counts={counts}
      view={view}
      clients={clients}
      users={users}
      currentUserId={ctx.userId}
      isAdmin={isAdmin}
      selectedUserId={selectedUserId}
      activityCalendarSync={syncPref}
    />
  )
}
