'use client'

import { Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'

import type { BellNotification } from '@/components/shared/notifications/notification-bell'

import { AgendaTopbarTabs } from './appointments/agenda-topbar-tabs'
import { TopbarNotifications } from './topbar-notifications'
import { TopbarPatientSearch } from './topbar-patient-search'
import { TopbarThemeToggle } from './topbar-theme-toggle'

// Título da página por rota (redesign — o h1 vive no topbar, não no corpo).
const ROUTE_TITLES: Record<string, string> = {
  '/overview': 'Visão geral',
  '/atividades': 'Atividades',
  '/appointments': 'Agenda',
  '/crm': 'Funil',
  '/patients': 'Pacientes',
  '/financial': 'Financeiro',
  '/goals': 'Metas',
  '/insights': 'Insights',
  '/procedures': 'Procedimentos',
  '/exportacoes': 'Exportações',
  '/notificacoes': 'Notificações',
  '/configuracoes': 'Configurações',
}

function titleFor(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]
  // Prefixo mais longo que casa (rotas aninhadas, ex.: /patients/123).
  const match = Object.keys(ROUTE_TITLES)
    .filter((href) => pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ? ROUTE_TITLES[match] : 'Senno'
}

type Props = {
  clientId: string
  /** Cargo sem patients:read não vê a busca de paciente. */
  canSearchPatients: boolean
  notifications: BellNotification[]
  unreadCount: number
}

/**
 * Topbar do domínio Clínica — redesign Senno (design.md §4 / handoff §3).
 * Esquerda: título da página. Direita: busca de paciente (colapsável) →
 * toggle de tema → sino → botão dourado "Novo lead".
 *
 * O "Novo lead" está SEM função por enquanto (decisão do redesign: o handoff
 * do fluxo desse botão será entregue depois) — não remover nem ligar a nada.
 */
export function ClinicTopbar({ clientId, canSearchPatients, notifications, unreadCount }: Props) {
  const pathname = usePathname()
  // Na Agenda as abas Agendamentos/Calendário SUBSTITUEM o h1, no mesmo
  // tamanho de fonte — elas SÃO o título da página (agenda-handoff §3.1).
  const isAgenda = pathname === '/appointments' || pathname.startsWith('/appointments/')
  // O Funil tem busca própria no corpo (design.md §4 / Funil-handoff §3.1):
  // a busca de paciente do topbar some SÓ nessa rota p/ não duplicar.
  const isFunil = pathname === '/crm' || pathname.startsWith('/crm/')

  return (
    <header className="flex flex-none items-center gap-4 border-b border-border bg-card px-6 py-3.5">
      {isAgenda ? (
        <AgendaTopbarTabs />
      ) : (
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[length:clamp(22px,0.5vw+18px,27px)] font-semibold tracking-[-0.01em]">
            {titleFor(pathname)}
          </h1>
        </div>
      )}
      <div className="flex items-center gap-[9px]">
        {canSearchPatients && !isFunil && <TopbarPatientSearch clientId={clientId} />}
        <TopbarThemeToggle />
        <TopbarNotifications notifications={notifications} unreadCount={unreadCount} />
        <button
          type="button"
          className="flex h-[38px] items-center gap-[7px] rounded-[9px] bg-primary px-[15px] text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
          Novo lead
        </button>
      </div>
    </header>
  )
}
