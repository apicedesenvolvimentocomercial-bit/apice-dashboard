'use client'

import type { UserRole } from '@prisma/client'
import {
  Activity,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  Settings,
  ShieldCheck,
  Target,
  User,
  Users,
  Kanban,
  DollarSign,
  UserCheck,
  Stethoscope,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
}

// Audit log é restrito a ADMIN (checado também em (admin)/settings/audit/page.tsx).
// STAFF não deve ver o item porque o clique sempre redireciona para /dashboard.
function buildAdminNav(role: UserRole): NavItem[] {
  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clients', label: 'Clínicas', icon: Building2 },
    { href: '/pipeline', label: 'Pipeline', icon: Kanban },
    { href: '/activities', label: 'Atividades', icon: Activity },
    { href: '/calendar', label: 'Calendário', icon: Calendar },
    { href: '/staff', label: 'Equipe', icon: Users },
  ]
  if (role === 'ADMIN') {
    items.push({ href: '/settings/audit', label: 'Audit Log', icon: ShieldCheck })
  }
  items.push({ href: '/settings', label: 'Configurações', icon: Settings })
  return items
}

// CLIENT_STAFF não administra dados da clínica (apenas perfil/senha), então
// o item vira "Meu perfil" para refletir o que ele de fato encontra na página.
function buildClientNav(role: UserRole): NavItem[] {
  const isOwner = role === 'CLIENT_OWNER'
  return [
    { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/goals', label: 'Metas', icon: Target },
    { href: '/crm', label: 'Pipeline', icon: Kanban },
    { href: '/financial', label: 'Financeiro', icon: DollarSign },
    { href: '/patients', label: 'Pacientes', icon: UserCheck },
    { href: '/appointments', label: 'Agendamentos', icon: Calendar },
    { href: '/procedures', label: 'Procedimentos', icon: Stethoscope },
    isOwner
      ? { href: '/settings', label: 'Configurações', icon: Settings }
      : { href: '/settings', label: 'Meu perfil', icon: User },
  ]
}

function useActiveItem(pathname: string, navItems: NavItem[]) {
  const hrefs = navItems.map((i) => i.href)
  return (href: string) => {
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    // Only active if no more-specific nav item also matches this pathname
    return !hrefs.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h))
  }
}

type Props = {
  role: UserRole
}

export function AppSidebar({ role }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const navItems = useMemo(() => {
    const isClientRole = role === 'CLIENT_OWNER' || role === 'CLIENT_STAFF'
    return isClientRole ? buildClientNav(role) : buildAdminNav(role)
  }, [role])
  const isActive = useActiveItem(pathname, navItems)

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r bg-white dark:bg-zinc-900',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* overflow-hidden here clips text during the width transition
          without affecting the absolutely-positioned toggle button */}
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 min-h-14 items-center border-b px-4">
          <span
            className={cn(
              'truncate text-sm font-bold text-primary',
              'transition-[transform,opacity] duration-200 ease-in-out',
              collapsed
                ? 'pointer-events-none -translate-x-2 opacity-0'
                : 'translate-x-0 opacity-100'
            )}
          >
            KPI Clinic OS
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto py-2 pl-2 pr-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    'truncate whitespace-nowrap transition-[transform,opacity] duration-200 ease-in-out',
                    collapsed
                      ? 'pointer-events-none -translate-x-2 opacity-0'
                      : 'translate-x-0 opacity-100'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* z-10 keeps the button above the main content area */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-[10px] top-16 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-white shadow-sm hover:bg-accent dark:bg-zinc-900"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
