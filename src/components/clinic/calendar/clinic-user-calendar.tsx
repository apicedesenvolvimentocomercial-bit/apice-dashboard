'use client'

import { CalendarPlus } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ClinicEventDialog } from '@/components/clinic/calendar/clinic-event-dialog'
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

export function ClinicUserCalendar({ events, holidays }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<string | null>(null)

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
      />

      <ClinicEventDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />

      <ClinicEventDialog
        mode="edit"
        open={editing !== null}
        event={editing}
        onOpenChange={(open) => {
          if (!open) setEditEventId(null)
        }}
      />
    </div>
  )
}
