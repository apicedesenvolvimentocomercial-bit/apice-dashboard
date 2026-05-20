'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg } from '@fullcalendar/core'
import { useEffect, useRef } from 'react'

import { toSPWallClock } from '@/lib/calendar-time'
import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

type Props = {
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  onEventClick: (eventId: string) => void
}

export function CalendarInner({ events, holidays, onEventClick }: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      calendarRef.current?.getApi().updateSize()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Evento sem `end` (atividade/deadline ou evento pontual) vira all-day:
  // ocupa exatamente um dia e renderiza como barra limpa. Sem isso, um
  // evento às 23:59 ganharia a duração default de 1h do FullCalendar,
  // terminaria 00:59 do dia seguinte e esticaria como barra de 2 dias.
  // Eventos com `end` definido mantêm o horário (bloco de tempo real).
  const fcEvents = events.map((e) => {
    const hasRange = e.end != null
    return {
      id: e.id,
      title: e.title,
      start: toSPWallClock(e.start),
      end: hasRange ? toSPWallClock(e.end as Date) : undefined,
      allDay: !hasRange,
      backgroundColor: e.color,
      borderColor: e.color,
      extendedProps: { source: e },
    }
  })

  const fcHolidays = holidays.map((h) => ({
    id: `holiday-${h.id}`,
    title: h.name,
    start: h.date,
    allDay: true,
    display: 'background' as const,
    backgroundColor: '#fde68a',
    extendedProps: { isHoliday: true, holidayName: h.name },
  }))

  function handleClick(info: EventClickArg) {
    if (info.event.extendedProps.isHoliday) return
    const source = info.event.extendedProps.source as CalendarEvent
    onEventClick(source.id)
  }

  return (
    <div ref={containerRef} className="fc-wrapper">
      <FullCalendar
        ref={calendarRef}
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
        events={[...fcEvents, ...fcHolidays]}
        eventClick={handleClick}
        height="auto"
        nowIndicator={true}
        dayMaxEvents={3}
        // Barras preenchidas e consistentes para todos os eventos (all-day e
        // com horário) — em vez do "pontinho" default dos eventos com hora.
        eventDisplay="block"
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />

      {holidays.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-[#fde68a]" /> Feriado
          </span>
        </div>
      )}
    </div>
  )
}
