import { redirect } from 'next/navigation'

import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopbar } from '@/components/admin/admin-topbar'
import { auth } from '@/server/auth'
import { getAdminContext } from '@/server/auth/admin-context'
import { getVisibleAgencyTabs } from '@/server/auth/agency-tabs'
import { AGENCY_TAB_MODULE } from '@/server/auth/agency-tabs'
import { getNotificationsForCurrentUser } from '@/server/queries/notification-queries'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'STAFF') redirect('/crm')

  // Deny-by-default (ledger agency-roles D3): ADMIN/titular veem tudo; STAFF com
  // cargo vê o liberado; STAFF SEM cargo → zero acesso, expulso p/ login.
  const ctx = await getAdminContext()
  const visibleTabs = await getVisibleAgencyTabs(ctx)
  if (!ctx.isOwner && role !== 'ADMIN' && visibleTabs.size === 0) redirect('/login')
  const isOwner = ctx.isOwner
  // Coroa/ADMIN: sem filtro (vê tudo). STAFF com cargo: só hrefs liberados.
  const visibleHrefs =
    ctx.isOwner || role === 'ADMIN'
      ? undefined
      : Object.entries(AGENCY_TAB_MODULE)
          .filter(([, mod]) => visibleTabs.has(mod))
          .map(([href]) => href)

  const notifResult = await getNotificationsForCurrentUser({ take: 10 }).catch(() => ({
    rows: [],
    unread: 0,
  }))

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar role={role} visibleHrefs={visibleHrefs} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar
          user={session.user}
          notifications={notifResult.rows}
          unreadCount={notifResult.unread}
          isOwner={isOwner}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
