import { redirect } from 'next/navigation'

import { ClinicSidebar } from '@/components/clinic/clinic-sidebar'
import { ClinicTopbar } from '@/components/clinic/clinic-topbar'
import { getClinicNotifications } from '@/domains/clinic/notifications/notification-queries'
import { auth } from '@/server/auth'
import { getClinicContext } from '@/server/auth/clinic-context'
import { getVisibleTabs, TAB_MODULE } from '@/server/auth/clinic-tabs'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'CLIENT_OWNER' && role !== 'CLIENT_STAFF') redirect('/dashboard')

  // Abas liberadas pelo cargo (deny-by-default, ledger agency-roles D3). Titular
  // vê tudo; com cargo vê o liberado; SEM cargo → zero acesso, expulso p/ login.
  const ctx = await getClinicContext()
  const visibleTabs = await getVisibleTabs(ctx)
  if (!ctx.isOwner && visibleTabs.size === 0) redirect('/login')
  const visibleHrefs = Object.entries(TAB_MODULE)
    .filter(([, mod]) => visibleTabs.has(mod))
    .map(([href]) => href)

  // Sino do topbar da clínica usa a query de clínica (escopo clientId), não a
  // compartilhada por userId — separação total do domínio (Fase 2).
  const { rows, unread } = await getClinicNotifications({ take: 10 }).catch(() => ({
    rows: [],
    unread: 0,
  }))

  return (
    <div className="flex h-screen overflow-hidden">
      <ClinicSidebar role={role} visibleHrefs={visibleHrefs} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ClinicTopbar user={session.user} notifications={rows} unreadCount={unread} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
