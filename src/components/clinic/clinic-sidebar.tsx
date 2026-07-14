'use client'

import {
  Activity,
  Banknote,
  Bell,
  Calendar,
  Download,
  Filter,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Settings,
  Syringe,
  Target,
  User,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

import { signOut } from '@/lib/auth-client'
import { logoutAction } from '@/server/actions/auth-actions'
import { cn, getInitials } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ClinicRole = 'CLIENT_OWNER' | 'CLIENT_STAFF'

type NavItem = { href: string; label: string; icon: React.ElementType }

// Ordem FIXA da nav (redesign — design.md §4): menu plano, sem seções.
// CLIENT_STAFF não administra dados da clínica (apenas perfil/senha), então o
// último item vira "Meu perfil" para refletir o que ele encontra na página.
function buildClinicNav(role: ClinicRole): NavItem[] {
  const isOwner = role === 'CLIENT_OWNER'
  return [
    { href: '/overview', label: 'Dashboard', icon: LayoutGrid },
    { href: '/atividades', label: 'Atividades', icon: Activity },
    { href: '/appointments', label: 'Agenda', icon: Calendar },
    { href: '/crm', label: 'Funil', icon: Filter },
    { href: '/patients', label: 'Pacientes', icon: Users },
    { href: '/financial', label: 'Financeiro', icon: Banknote },
    { href: '/goals', label: 'Metas', icon: Target },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/procedures', label: 'Procedimentos', icon: Syringe },
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mt-auto flex w-full items-center gap-2.5 rounded-[10px] bg-muted p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Menu da conta"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/20 text-[12.5px] font-semibold text-primary-text">
              {getInitials(userName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-foreground">
                {userName}
              </span>
              {roleLabel && (
                <span className="block text-[11px] text-muted-foreground">{roleLabel}</span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{userName}</p>
              {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/configuracoes">
              <User className="mr-2 h-4 w-4" />
              Meu perfil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={async () => {
              await logoutAction()
              signOut({ callbackUrl: '/login' })
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  )
}
