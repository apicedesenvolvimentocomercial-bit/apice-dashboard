import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { auth } from '@/server/auth'
import { getNotificationsForCurrentUser } from '@/server/queries/notification-queries'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'STAFF') redirect('/crm')

  const { rows, unread } = await getNotificationsForCurrentUser({ take: 10 }).catch(() => ({
    rows: [],
    unread: 0,
  }))

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar
          user={session.user}
          notifications={rows}
          unreadCount={unread}
          notificationsHref="/notifications"
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
