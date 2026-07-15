'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg } from '@fullcalendar/core'
import { useEffect, useRef } from 'react'

import type { CalendarEvent, CalendarHoliday } from '@/shared/calendar-types'

import { mapCalendarEventToFc } from './fc-event-mapping'

type Props = {
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  onEventClick: (eventId: string) => void
  // Disparado quando a janela visível muda (navegar mês/semana). Permite ao
  // consumidor recarregar os eventos do novo intervalo (item 7 / fix das setas).
  onRangeChange?: (from: Date, to: Date) => void
}

export function CalendarInner({ events, holidays, onEventClick, onRangeChange }: Props) {
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

  // Regra de mapeamento (sentinela fim-do-dia → all-day; sem `end` → 1h
  // clampada no mesmo dia SP) extraída p/ `fc-event-mapping.ts` — é
  // compartilhada com a skin da Agenda da clínica. Comportamento idêntico.
  const fcEvents = events.map((e) => {
    const m = mapCalendarEventToFc(e)
    return {
      id: m.id,
      title: m.title,
      start: m.start,
      ...(m.end != null ? { end: m.end } : {}),
      allDay: m.allDay,
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
        datesSet={onRangeChange ? (arg) => onRangeChange(arg.start, arg.end) : undefined}
        height="auto"
        nowIndicator={true}
        dayMaxEvents={3}
        // Aba dia/semana (timeGrid): eventos no mesmo horário ficam lado a
        // lado (não sobrepostos) com um pequeno respiro entre eles (CSS). Se
        // não couberem, o excedente colapsa num link "+N" que abre o popover.
        slotEventOverlap={false}
        eventMaxStack={3}
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
