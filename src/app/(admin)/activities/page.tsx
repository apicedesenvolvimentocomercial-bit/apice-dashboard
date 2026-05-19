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

function parseView(v: string | undefined): 'today' | 'week' | 'overdue' | 'all' {
  if (v === 'today' || v === 'week' || v === 'overdue' || v === 'all') return v
  return 'today'
}

export default async function AdminActivitiesPage({ searchParams }: Props) {
  const sp = await searchParams
  const view = parseView(sp.view)

  const ctx = await getTenantContext()
  const isAdmin = ctx.role === 'ADMIN'

  // STAFF: sempre fixado em si mesmo (query força isso). Admin pode escolher
  // pasta de usuário; sem escolha, vê todas as atividades da organização.
  const selectedUserId = isAdmin && sp.userId && sp.userId !== 'all' ? sp.userId : null

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
    client: r.client,
    assignedTo: r.assignedTo,
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
