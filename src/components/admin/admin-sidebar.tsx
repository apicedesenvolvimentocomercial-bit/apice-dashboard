'use client'

import {
  Activity,
  Building2,
  Calendar,
  Kanban,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'

import { SidebarShell, type NavItem } from '@/components/layout/sidebar-shell'

type AdminRole = 'ADMIN' | 'STAFF'

// Audit log é restrito a ADMIN (checado também em (admin)/settings/audit/page.tsx).
// STAFF não deve ver o item porque o clique sempre redireciona para /dashboard.
function buildAdminNav(role: AdminRole): NavItem[] {
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

/**
 * Sidebar EXCLUSIVA do domínio Admin/agência (Fase 5). Não conhece rotas de
 * clínica. O único branch interno (`role === 'ADMIN'`) é permissão granular
 * intra-admin (Audit Log), não escolha de domínio.
 */
export function AdminSidebar({ role }: { role: AdminRole }) {
  const navItems = useMemo(() => buildAdminNav(role), [role])
  return <SidebarShell navItems={navItems} />
}
