import type { Metadata } from 'next'

import { ActivitiesPage } from '@/modules/activities/activities-page'
import type { ActivityView } from '@/modules/activities/types'
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

  // Pasta selecionada via URL. STAFF só pode escolher entre "Todos" (null) e a
  // própria pasta — qualquer outro id é forçado para null (a query também
  // re-checa o vínculo, então a URL não consegue vazar atividades alheias).
  const requestedUserId = sp.userId && sp.userId !== 'all' ? sp.userId : null
  const selectedUserId = isAdmin
    ? requestedUserId
    : requestedUserId === ctx.userId
      ? ctx.userId
      : null

  const [{ rows, counts }, users, clients] = await Promise.all([
    getActivitiesForTenant({ view, assignedToId: selectedUserId ?? undefined }),
    listOrgUsers(),
    listOrgClients(),
  ])

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
    />
  )
}
