'use client'

import {
  Activity,
  Banknote,
  Bell,
  Calendar,
  ChevronUp,
  Download,
  Filter,
  LayoutGrid,
  Lightbulb,
  Loader2,
  LogOut,
  Settings,
  Syringe,
  Target,
  User,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { signOut } from '@/lib/auth-client'
import { logoutAction } from '@/server/actions/auth-actions'
import { cn, getInitials } from '@/lib/utils'

type ClinicRole = 'CLIENT_OWNER' | 'CLIENT_STAFF'

type NavItem = { href: string; label: string; icon: React.ElementType }

// Ordem FIXA da nav (redesign — design.md §4): menu plano, sem seções.
// CLIENT_STAFF não administra dados da clínica (apenas perfil/senha), então o
// último item vira "Meu perfil" para refletir o que ele encontra na página.
function buildClinicNav(role: ClinicRole): NavItem[] {
  const isOwner = role === 'CLIENT_OWNER'
  return [
    { href: '/overview', label: 'Dashboard', icon: LayoutGrid },
    { href: '/procedures', label: 'Procedimentos', icon: Syringe },
    { href: '/crm', label: 'Funil', icon: Filter },
    { href: '/patients', label: 'Pacientes', icon: Users },
    { href: '/appointments', label: 'Agenda', icon: Calendar },
    { href: '/atividades', label: 'Atividades', icon: Activity },
    { href: '/financial', label: 'Financeiro', icon: Banknote },
    { href: '/goals', label: 'Metas', icon: Target },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/exportacoes', label: 'Exportações', icon: Download },
    { href: '/notificacoes', label: 'Notificações', icon: Bell },
    isOwner
      ? { href: '/configuracoes', label: 'Configurações', icon: Settings }
      : { href: '/configuracoes', label: 'Meu perfil', icon: User },
  ]
}

function useActiveItem(pathname: string, navItems: NavItem[]) {
  const hrefs = navItems.map((i) => i.href)
  return (href: string) => {
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    return !hrefs.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h))
  }
}

type Props = {
  role: ClinicRole
  /** Só os hrefs liberados pelo cargo (deny-by-default); undefined = tudo. */
  visibleHrefs?: string[]
  clinicName: string
  /** Linha secundária sob o nome da clínica (cidade · UF); null = oculta. */
  clinicSub: string | null
  userName: string
  /** "Titular" ou nome do cargo; null = sem rótulo. */
  roleLabel: string | null
}

/**
 * Sidebar EXCLUSIVA do domínio Clínica — redesign Senno (design.md §4):
 * 236px fixa, bg-card, menu plano na ordem fixa, item ativo em dourado-texto
 * sobre accent, rodapé com o usuário (avatar de iniciais + cargo). O rodapé
 * abre o menu de conta (Meu perfil / Sair) — o menu de usuário saiu do topbar.
 */
export function ClinicSidebar({
  role,
  visibleHrefs,
  clinicName,
  clinicSub,
  userName,
  roleLabel,
}: Props) {
  const pathname = usePathname()
  const navItems = useMemo(() => {
    const items = buildClinicNav(role)
    if (!visibleHrefs) return items
    const allowed = new Set(visibleHrefs)
    return items.filter((item) => allowed.has(item.href))
  }, [role, visibleHrefs])
  const isActive = useActiveItem(pathname, navItems)

  return (
    <aside className="flex w-[236px] flex-none flex-col border-r border-border bg-card px-3.5 py-[18px]">
      {/* Marca: logo (inicial da clínica) + nome + linha secundária */}
      <div className="flex items-center gap-2.5 px-2 pb-[18px] pt-1.5">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-primary">
          <span className="text-[17px] font-bold text-primary-foreground">
            {clinicName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{clinicName}</div>
          {clinicSub && <div className="text-[11px] text-muted-foreground">{clinicSub}</div>}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex items-center gap-[11px] rounded-lg px-2.5 py-2 text-[13.5px] transition-colors hover:bg-accent',
                active
                  ? 'bg-accent font-semibold text-primary-text'
                  : 'font-medium text-muted-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
              <span className="flex-1 truncate whitespace-nowrap">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Rodapé: usuário logado — abre o menu de conta */}
      <AccountMenu userName={userName} roleLabel={roleLabel} />
    </aside>
  )
}

/**
 * Menu de conta do rodapé da sidebar. Em vez de um popover destacado, o painel
 * é a MESMA superfície do botão (identidade): ao abrir, as ações (Meu perfil /
 * Sair) crescem PARA CIMA sobre `bg-accent`, formando um bloco contínuo com o
 * botão — sem repetir o nome (que já aparece no botão). Fecha ao clicar fora ou
 * com Esc. Sair mostra estado ocupado (logout assíncrono derruba TODAS as
 * sessões antes do signOut).
 */
function AccountMenu({ userName, roleLabel }: { userName: string; roleLabel: string | null }) {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function handleLogout() {
    setLeaving(true)
    await logoutAction()
    signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="relative mt-auto">
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Superfície única: quando aberta, ganha o `bg-accent` do botão + moldura,
          e as ações ficam ACIMA do botão (expansão para cima, não popover). */}
      <div
        className={cn(
          'relative z-50 rounded-[10px] transition-colors',
          open && 'bg-accent shadow-pop ring-1 ring-border'
        )}
      >
        {open && (
          <div role="menu" aria-label="Conta" className="flex flex-col px-1.5 pb-1 pt-1.5">
            <Link
              href="/configuracoes"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-[11px] rounded-lg px-2 py-[9px] text-[12.5px] font-medium text-foreground transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <User className="h-[15px] w-[15px] flex-none text-muted-foreground" />
              Meu perfil
            </Link>

            <div className="mx-2 my-1 h-px bg-border/70" />

            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={leaving}
              className="flex items-center gap-[11px] rounded-lg px-2 py-[9px] text-left text-[12.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {leaving ? (
                <Loader2 className="h-[15px] w-[15px] flex-none animate-spin" />
              ) : (
                <LogOut className="h-[15px] w-[15px] flex-none" />
              )}
              {leaving ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        )}

        {/* Divisor entre as ações e a identidade — só existe com o menu aberto. */}
        {open && <div className="mx-2.5 h-px bg-border/70" />}

        {/* Botão de identidade — sempre visível; é o gatilho. Ao abrir vira
            transparente p/ herdar o `bg-accent` da superfície e cola no divisor. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu da conta"
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open
              ? 'rounded-t-none bg-transparent hover:bg-background/40'
              : 'bg-muted hover:bg-accent'
          )}
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/20 text-[12.5px] font-semibold text-primary-text">
            {getInitials(userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-foreground">
              {userName}
            </span>
            {roleLabel && (
              <span className="block truncate text-[11px] text-muted-foreground">{roleLabel}</span>
            )}
          </span>
          <ChevronUp
            className={cn(
              'h-3.5 w-3.5 flex-none text-muted-foreground transition-transform duration-200',
              !open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  )
}
