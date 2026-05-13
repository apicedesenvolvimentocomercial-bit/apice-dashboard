'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg } from '@fullcalendar/core'
import { useRouter } from 'next/navigation'

import type { CalendarEvent } from '@/server/queries/calendar-queries'

type Props = {
  events: CalendarEvent[]
}

export function CalendarInner({ events }: Props) {
  const router = useRouter()

  const fcEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end ?? undefined,
    allDay: false,
    backgroundColor: e.color,
    borderColor: e.color,
    extendedProps: { source: e },
  }))

  function handleClick(info: EventClickArg) {
    const source = info.event.extendedProps.source as CalendarEvent
    if (source.link) router.push(source.link)
  }

  return (
    <div className="fc-wrapper">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView="dayGridMonth"
        locale={ptBrLocale}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        }}
        buttonText={{
          today: 'Hoje',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          list: 'Lista',
        }}
        events={fcEvents}
        eventClick={handleClick}
        height="auto"
        nowIndicator={true}
        dayMaxEvents={3}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[#3b82f6]" /> Agendamento
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[#2563eb]" /> Atividade média
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[#d97706]" /> Atividade alta
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-[#dc2626]" /> Atividade urgente / no-show
        </span>
      </div>
    </div>
  )
}
