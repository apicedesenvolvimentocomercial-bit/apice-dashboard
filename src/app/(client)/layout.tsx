import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { getClinicNotifications } from '@/domains/clinic/notifications/notification-queries'
import { auth } from '@/server/auth'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'CLIENT_OWNER' && role !== 'CLIENT_STAFF') redirect('/dashboard')

  // Sino do topbar da clínica usa a query de clínica (escopo clientId), não a
  // compartilhada por userId — separação total do domínio (Fase 2).
  const { rows, unread } = await getClinicNotifications({ take: 10 }).catch(() => ({
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
          notificationsHref="/notificacoes"
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
