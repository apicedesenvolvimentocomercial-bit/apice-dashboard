import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { auth } from '@/server/auth'
import { getNotificationsForCurrentUser } from '@/server/queries/notification-queries'
import { isOrganizationOwner } from '@/server/queries/organization-queries'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role
  const isAdminSide = role === 'ADMIN' || role === 'STAFF'
  const notificationsHref = isAdminSide ? '/notifications' : undefined

  const [notifResult, isOwner] = await Promise.all([
    getNotificationsForCurrentUser({ take: 10 }).catch(() => ({ rows: [], unread: 0 })),
    isOrganizationOwner(session.user.id, session.user.organizationId).catch(() => false),
  ])

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar
          user={session.user}
          notifications={notifResult.rows}
          unreadCount={notifResult.unread}
          notificationsHref={notificationsHref}
          isOwner={isOwner}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
