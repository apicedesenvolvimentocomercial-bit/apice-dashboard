'use client'

import dynamic from 'next/dynamic'
import { CalendarPlus, Download } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

import { EventDialog } from './event-dialog'
import { ImportHolidaysDialog } from './import-holidays-dialog'

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
  isAdmin: boolean
}

export function UserCalendar({ events, holidays, isAdmin }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const editing = editEventId ? (events.find((e) => e.id === editEventId) ?? null) : null

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Importar feriados
          </Button>
        )}
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

      <EventDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />

      <EventDialog
        mode="edit"
        open={editing !== null}
        event={editing}
        onOpenChange={(open) => {
          if (!open) setEditEventId(null)
        }}
      />

      {isAdmin && (
        <ImportHolidaysDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          existingDates={holidays.map((h) => h.date)}
        />
      )}
    </div>
  )
}
