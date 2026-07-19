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
  userEmail: string | null
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
  userEmail,
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
      <AccountMenu userName={userName} userEmail={userEmail} roleLabel={roleLabel} />
    </aside>
  )
}

/**
 * Menu de conta do rodapé da sidebar (redesign — design.md §5 "Popovers"):
 * painel `bg-popover` radius 12px com sombra `shadow-pop`, overlay para fechar
 * ao clicar fora, Esc para fechar e rodapé com a dica. Sair mostra estado
 * ocupado (o logout é assíncrono: derruba TODAS as sessões antes do signOut).
 */
function AccountMenu({
  userName,
  userEmail,
  roleLabel,
}: {
  userName: string
  userEmail: string | null
  roleLabel: string | null
}) {
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu da conta"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[10px] bg-muted p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'bg-accent'
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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Conta"
            className="absolute inset-x-0 bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-pop"
          >
            {/* Identidade: quem está logado nesta sessão */}
            <div className="flex items-center gap-[11px] px-3.5 pb-2.5 pt-3">
              <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-text">
                {getInitials(userName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {userName}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {userEmail ?? roleLabel ?? 'Sessão ativa'}
                </span>
              </span>
            </div>

            <div className="flex flex-col px-1.5 pb-1.5">
              <Link
                href="/configuracoes"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-[11px] rounded-lg px-2 py-[9px] text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <User className="h-[15px] w-[15px] flex-none text-muted-foreground" />
                Meu perfil
              </Link>

              <div className="-mx-1.5 my-1 h-px bg-border" />

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

            <div className="flex items-center justify-end border-t border-border bg-muted/40 px-3.5 py-[9px]">
              <span className="text-[10.5px] text-muted-foreground">Esc para fechar</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
