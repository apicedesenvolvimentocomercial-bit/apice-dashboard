'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  createClinicCalendarEventAction,
  deleteClinicCalendarEventAction,
} from '@/domains/clinic/calendar/calendar-event-actions'

/**
 * Calendário do DOMÍNIO CLÍNICA (Fase 4) — visão agenda enxuta (lista por dia).
 * Componente próprio da clínica; usa só actions de clínica. Versão lean: o
 * FullCalendar rico do admin não é compartilhado (§2). Pode evoluir depois.
 */

type ClinicEvent = {
  id: string
  title: string
  start: Date
  end: Date | null
  notes: string | null
  category: string | null
  activityId: string | null
}

type Props = {
  events: ClinicEvent[]
  monthLabel: string
}

export function ClinicCalendarPage({ events, monthLabel }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  function create() {
    if (!title.trim() || !date) {
      toast.error('Informe título e data')
      return
    }
    startTransition(async () => {
      const r = await createClinicCalendarEventAction({
        title: title.trim(),
        startDate: date,
        startTime: time || undefined,
      })
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      setTitle('')
      setDate('')
      setTime('')
      toast.success('Evento criado')
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteClinicCalendarEventAction(id)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      router.refresh()
    })
  }

  // Agrupa por dia (YYYY-MM-DD) para uma agenda simples.
  const byDay = new Map<string, ClinicEvent[]>()
  for (const e of events) {
    const key = format(new Date(e.start), 'yyyy-MM-dd')
    const arr = byDay.get(key) ?? []
    arr.push(e)
    byDay.set(key, arr)
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
        <p className="text-muted-foreground">Agenda da sua clínica · {monthLabel}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Data</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Hora</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          />
        </div>
        <Button onClick={create} disabled={pending}>
          Adicionar evento
        </Button>
      </div>

      {days.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhum evento neste mês.
        </div>
      ) : (
        <div className="space-y-4">
          {days.map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">
                {format(new Date(day + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h2>
              <ul className="divide-y rounded-lg border bg-card">
                {dayEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                      {format(new Date(e.start), 'HH:mm')}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{e.title}</p>
                      {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
                    </div>
                    {!e.activityId && (
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        disabled={pending}
                        aria-label="Excluir evento"
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
