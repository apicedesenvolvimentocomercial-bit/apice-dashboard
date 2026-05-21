'use client'

import dynamic from 'next/dynamic'

import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

/**
 * Calendário da clínica em modo READ-ONLY para o ADMIN. Reusa o render puro
 * `CalendarInner` (FullCalendar) com clique inerte — admin só visualiza, não
 * cria/edita evento da clínica (reforma divisão total).
 */
const CalendarInner = dynamic(
  () => import('@/modules/calendar/calendar-inner').then((m) => m.CalendarInner),
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

export function ClientClinicCalendar({ events, holidays }: Props) {
  return (
    <div className="space-y-2 rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">Calendário da clínica — somente leitura.</p>
      <CalendarInner events={events} holidays={holidays} onEventClick={() => {}} />
    </div>
  )
}
