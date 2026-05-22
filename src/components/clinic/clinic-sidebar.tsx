'use client'

import {
  Activity,
  Bell,
  Calendar,
  DollarSign,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Stethoscope,
  Target,
  User,
  UserCheck,
} from 'lucide-react'
import { useMemo } from 'react'

import { SidebarShell, type NavItem } from '@/components/layout/sidebar-shell'

type ClinicRole = 'CLIENT_OWNER' | 'CLIENT_STAFF'

// CLIENT_STAFF não administra dados da clínica (apenas perfil/senha), então
// o item vira "Meu perfil" para refletir o que ele de fato encontra na página.
function buildClinicNav(role: ClinicRole): NavItem[] {
  const isOwner = role === 'CLIENT_OWNER'
  return [
    { href: '/overview', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/goals', label: 'Metas', icon: Target },
    { href: '/crm', label: 'Pipeline', icon: Kanban },
    { href: '/financial', label: 'Financeiro', icon: DollarSign },
    { href: '/patients', label: 'Pacientes', icon: UserCheck },
    { href: '/appointments', label: 'Agenda', icon: Calendar },
    { href: '/procedures', label: 'Procedimentos', icon: Stethoscope },
    { href: '/atividades', label: 'Atividades', icon: Activity },
    { href: '/notificacoes', label: 'Notificações', icon: Bell },
    isOwner
      ? { href: '/configuracoes', label: 'Configurações', icon: Settings }
      : { href: '/configuracoes', label: 'Meu perfil', icon: User },
  ]
}

/**
 * Sidebar EXCLUSIVA do domínio Clínica (Fase 5). Não conhece rotas de admin. O
 * calendário pessoal não tem item próprio: vive embutido na aba Agenda
 * (`/appointments`, Fase 4). O branch interno (owner vs staff) é só rótulo de
 * permissão intra-clínica, não escolha de domínio.
 */
export function ClinicSidebar({ role }: { role: ClinicRole }) {
  const navItems = useMemo(() => buildClinicNav(role), [role])
  return <SidebarShell navItems={navItems} />
}
