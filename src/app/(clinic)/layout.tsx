import { redirect } from 'next/navigation'

import { ClinicSidebar } from '@/components/clinic/clinic-sidebar'
import { ClinicTopbar } from '@/components/clinic/clinic-topbar'
import { getClinicChrome } from '@/domains/clinic/chrome/chrome-queries'
import { getClinicNotifications } from '@/domains/clinic/notifications/notification-queries'
import { auth } from '@/server/auth'
import { getClinicContext } from '@/server/auth/clinic-context'
import { getVisibleTabs, TAB_MODULE } from '@/server/auth/clinic-tabs'
import { can } from '@/server/auth/permissions'

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

  // Chrome do redesign: identidade da clínica (sidebar) + rótulo do usuário.
  const chrome = await getClinicChrome()

  // Botão global "Novo lead" do topbar: exige crm:write (titular sempre pode).
  const canCreateLead = ctx.isOwner || (await can(ctx.userId, ctx.role, 'crm', 'write'))

  // Sino do topbar da clínica usa a query de clínica (escopo clientId), não a
  // compartilhada por userId — separação total do domínio (Fase 2).
  const { rows, unread } = await getClinicNotifications({ take: 10 }).catch(() => ({
    rows: [],
    unread: 0,
  }))

  return (
    <div className="flex h-screen overflow-hidden">
      <ClinicSidebar
        role={role}
        visibleHrefs={visibleHrefs}
        clinicName={chrome.clinicName}
        clinicSub={chrome.clinicSub}
        userName={session.user.name ?? 'Usuário'}
        roleLabel={chrome.roleLabel}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ClinicTopbar
          clientId={ctx.clientId}
          canSearchPatients={ctx.isOwner || visibleTabs.has('patients')}
          canCreateLead={canCreateLead}
          notifications={rows}
          unreadCount={unread}
        />
        {/* Só o corpo rola — sidebar e topbar ficam fixos (handoff §1). */}
        <main className="flex-1 overflow-y-auto px-6 py-[22px]">{children}</main>
      </div>
    </div>
  )
}
