'use client'

import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  Kanban,
  DollarSign,
  UserCheck,
  Stethoscope,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
}

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clínicas', icon: Building2 },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/activities', label: 'Atividades', icon: Activity },
  { href: '/calendar', label: 'Calendário', icon: Calendar },
  { href: '/reports', label: 'Relatórios', icon: FileText },
  { href: '/staff', label: 'Equipe', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

const clientNav: NavItem[] = [
  { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm', label: 'CRM / Leads', icon: Kanban },
  { href: '/financial', label: 'Financeiro', icon: DollarSign },
  { href: '/patients', label: 'Pacientes', icon: UserCheck },
  { href: '/appointments', label: 'Agendamentos', icon: Calendar },
  { href: '/procedures', label: 'Procedimentos', icon: Stethoscope },
  { href: '/reports', label: 'Relatórios', icon: BarChart3 },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

type Props = {
  role: string
}

export function AppSidebar({ role }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isClientRole = role === 'CLIENT_OWNER' || role === 'CLIENT_STAFF'
  const navItems = isClientRole ? clientNav : adminNav

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r bg-white transition-all duration-200 dark:bg-zinc-900',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex h-14 items-center border-b px-4">
        {!collapsed && (
          <span className="truncate text-sm font-bold text-primary">KPI Clinic OS</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border bg-white shadow-sm hover:bg-accent dark:bg-zinc-900"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
