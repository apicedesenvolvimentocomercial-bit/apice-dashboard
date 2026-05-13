'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ActivityCard } from './activity-card'
import { CreateActivityDialog } from './create-activity-dialog'
import { QuickAdd } from './quick-add'
import type { ActivityView, ActivityView_Counts } from './types'

type View = 'today' | 'week' | 'overdue' | 'all'

const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'all', label: 'Todas' },
]

type Props = {
  activities: ActivityView[]
  counts: ActivityView_Counts
  view: View
  clients: { id: string; name: string }[]
  users: { id: string; name: string }[]
  lockClient?: boolean
  defaultClientId?: string | null
}

export function ActivitiesPage({
  activities,
  counts,
  view,
  clients,
  users,
  lockClient,
  defaultClientId,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setView(v: View) {
    const sp = new URLSearchParams(params.toString())
    sp.set('view', v)
    router.push(`${pathname}?${sp.toString()}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atividades</h1>
          <p className="text-muted-foreground">
            Tarefas, reuniões e ligações organizadas por prioridade e prazo
          </p>
        </div>
        <CreateActivityDialog
          clients={clients}
          users={users}
          lockClient={lockClient}
          defaultClientId={defaultClientId ?? null}
        />
      </div>

      <QuickAdd />

      <div className="flex flex-wrap gap-2 border-b">
        {TABS.map((t) => {
          const isActive = view === t.key
          const count = counts[t.key]
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'ml-2 rounded-full px-2 py-0.5 text-xs',
                  t.key === 'overdue' && count > 0
                    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {activities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Nenhuma atividade neste filtro.
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="?view=all">Ver todas</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  )
}
