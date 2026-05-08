'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Kanban, UserCheck, Calendar, DollarSign } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = { clientId: string }

const tabs = [
  { href: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { href: 'crm', label: 'CRM / Leads', icon: Kanban },
  { href: 'financial', label: 'Financeiro', icon: DollarSign },
  { href: 'patients', label: 'Pacientes', icon: UserCheck },
  { href: 'appointments', label: 'Agendamentos', icon: Calendar },
]

export function ClientSubNav({ clientId }: Props) {
  const pathname = usePathname()
  const base = `/clients/${clientId}`

  return (
    <nav className="-mb-px flex gap-0 overflow-x-auto">
      {tabs.map((tab) => {
        const href = `${base}/${tab.href}`
        const isActive = pathname === href || pathname.startsWith(href + '/')
        const Icon = tab.icon

        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
