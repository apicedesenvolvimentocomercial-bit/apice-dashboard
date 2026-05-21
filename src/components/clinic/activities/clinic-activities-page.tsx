'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Trash2, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { ActivityPriority, ActivityStatus, ActivityType } from '@prisma/client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  deleteClinicActivityAction,
  quickAddClinicActivityAction,
  updateClinicActivityStatusAction,
} from '@/domains/clinic/activities/activity-actions'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
} from '@/modules/activities/types'

type View = 'today' | 'week' | 'overdue' | 'all' | 'done'

const TABS: { key: View; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'all', label: 'Todas' },
  { key: 'done', label: 'Feitas' },
]

type ClinicActivity = {
  id: string
  title: string
  description: string | null
  type: ActivityType
  status: ActivityStatus
  priority: ActivityPriority
  dueDate: Date | null
  assignedTo: { id: string; name: string; image: string | null } | null
}

type Props = {
  activities: ClinicActivity[]
  counts: Record<View, number>
  view: View
}

export function ClinicActivitiesPage({ activities, counts, view }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [quickTitle, setQuickTitle] = useState('')

  function setView(v: View) {
    const sp = new URLSearchParams(params.toString())
    sp.set('view', v)
    router.push(`${pathname}?${sp.toString()}`)
  }

  function quickAdd() {
    const title = quickTitle.trim()
    if (!title) return
    startTransition(async () => {
      const r = await quickAddClinicActivityAction(title)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      setQuickTitle('')
      toast.success('Atividade criada')
      router.refresh()
    })
  }

  function setStatus(id: string, status: ActivityStatus) {
    startTransition(async () => {
      const r = await updateClinicActivityStatusAction(id, status)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteClinicActivityAction(id)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Atividades</h1>
        <p className="text-muted-foreground">Tarefas e lembretes da sua clínica</p>
      </div>

      <div className="flex gap-2">
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
          placeholder="Adicionar tarefa rápida (vence hoje)…"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={pending}
        />
        <Button onClick={quickAdd} disabled={pending || !quickTitle.trim()}>
          Adicionar
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const isActive = view === t.key
          const count = counts[t.key]
          const isOverdue = t.key === 'overdue' && count > 0
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none',
                  isActive && !isOverdue && 'bg-emerald-100 text-emerald-700',
                  isOverdue && 'bg-red-100 text-red-700',
                  !isActive && !isOverdue && 'bg-muted text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {activities.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhuma atividade neste filtro.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn('rounded px-1.5 py-0.5 font-medium', PRIORITY_COLOR[a.priority])}
                  >
                    {PRIORITY_LABEL[a.priority]}
                  </span>
                  <span className="text-muted-foreground">{TYPE_LABEL[a.type]}</span>
                  <span className="text-muted-foreground">· {STATUS_LABEL[a.status]}</span>
                  {a.dueDate && (
                    <span className="text-muted-foreground">
                      · vence {format(new Date(a.dueDate), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'font-medium',
                    a.status === 'COMPLETED' && 'line-through opacity-70'
                  )}
                >
                  {a.title}
                </p>
                {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                {a.assignedTo && (
                  <p className="text-xs text-muted-foreground">Responsável: {a.assignedTo.name}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {a.status !== 'COMPLETED' ? (
                  <button
                    type="button"
                    onClick={() => setStatus(a.id, 'COMPLETED')}
                    disabled={pending}
                    aria-label="Concluir"
                    className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus(a.id, 'PENDING')}
                    disabled={pending}
                    aria-label="Reabrir"
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={pending}
                  aria-label="Excluir"
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
