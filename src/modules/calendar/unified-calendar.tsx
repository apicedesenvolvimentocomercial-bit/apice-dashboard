'use client'

import dynamic from 'next/dynamic'

import type { CalendarEvent } from '@/server/queries/calendar-queries'

const CalendarInner = dynamic(() => import('./calendar-inner').then((m) => m.CalendarInner), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
})

type Props = {
  events: CalendarEvent[]
}

export function UnifiedCalendar({ events }: Props) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <CalendarInner events={events} />
    </div>
  )
}
