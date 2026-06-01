'use client'

import { CalendarPlus } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ClinicEventDialog } from '@/components/clinic/calendar/clinic-event-dialog'
import { getClinicCalendarRangeAction } from '@/domains/clinic/calendar/calendar-event-actions'
import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

/**
 * Calendário pessoal do DOMÍNIO CLÍNICA (Fase 4). Reusa o render puro
 * `CalendarInner` (FullCalendar — sem lógica de domínio) mas usa o
 * `ClinicEventDialog` (actions de clínica). Sem "importar feriados" (admin).
 * Feriados exibidos vêm de `ClinicHoliday`.
 */
const CalendarInner = dynamic(
  () => import('@/components/shared/calendar/calendar-inner').then((m) => m.CalendarInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center rounded-lg border">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
)

type Props = {
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
}

export function ClinicUserCalendar({ events: initialEvents, holidays: initialHolidays }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  // Eventos/feriados em estado: navegar de mês refaz o fetch da janela visível
  // (item 7 / fix das setas) — antes só vinha o mês corrente do SSR.
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [holidays, setHolidays] = useState<CalendarHoliday[]>(initialHolidays)
  const rangeRef = useRef<{ from: string; to: string } | null>(null)

  const loadRange = useCallback((from: Date, to: Date) => {
    rangeRef.current = { from: from.toISOString(), to: to.toISOString() }
    getClinicCalendarRangeAction(from.toISOString(), to.toISOString()).then((res) => {
      if (res.success) {
        setEvents(res.data.events)
        setHolidays(res.data.holidays)
      }
    })
  }, [])

  // Refaz o fetch da janela atual (após criar/excluir). Usa a última range vista.
  const refetch = useCallback(() => {
    const r = rangeRef.current
    if (!r) return
    getClinicCalendarRangeAction(r.from, r.to).then((res) => {
      if (res.success) {
        setEvents(res.data.events)
        setHolidays(res.data.holidays)
      }
    })
  }, [])

  const editing = editEventId ? (events.find((e) => e.id === editEventId) ?? null) : null

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Novo evento
        </Button>
      </div>

      <CalendarInner
        events={events}
        holidays={holidays}
        onEventClick={(id) => setEditEventId(id)}
        onRangeChange={loadRange}
      />

      <ClinicEventDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onChanged={refetch}
      />

      <ClinicEventDialog
        mode="edit"
        open={editing !== null}
        event={editing}
        onOpenChange={(open) => {
          if (!open) setEditEventId(null)
        }}
        onChanged={refetch}
      />
    </div>
  )
}
