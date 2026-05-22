import { redirect } from 'next/navigation'

import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopbar } from '@/components/admin/admin-topbar'
import { auth } from '@/server/auth'
import { getNotificationsForCurrentUser } from '@/server/queries/notification-queries'
import { isOrganizationOwner } from '@/server/queries/organization-queries'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'STAFF') redirect('/crm')

  const [notifResult, isOwner] = await Promise.all([
    getNotificationsForCurrentUser({ take: 10 }).catch(() => ({ rows: [], unread: 0 })),
    isOrganizationOwner(session.user.id, session.user.organizationId).catch(() => false),
  ])

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar role={role} />
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
