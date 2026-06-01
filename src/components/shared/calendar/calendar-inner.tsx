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
import type { CalendarEvent, CalendarHoliday } from '@/shared/calendar-types'

const ONE_HOUR_MS = 60 * 60 * 1000

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

  // Atividade "fim do dia" (sentinela 23:59 SP, sem `end`) não tem horário
  // real: é só um prazo "vence neste dia". No timeGrid (dia/semana) um bloco
  // às 23:59 cai no rodapé do grid com 1 min de altura e fica cortado pela
  // borda. Por isso esses eventos viram all-day — caem na faixa all-day do
  // topo (nunca cortada) na visão dia/semana e como bloco normal no mês. É
  // pra isso que a faixa all-day existe.
  //
  // Demais eventos sem `end` assumem 1h como bloco de tempo real. O fim é
  // clampado no mesmo dia SP pra barra não esticar pro dia seguinte quando
  // começa perto da meia-noite. O clamp NÃO pode igualar o start (duração
  // zero): o FullCalendar trataria como "sem fim" e aplicaria 1h default,
  // transbordando pro dia seguinte. Por isso fecha em 23:59:59. Eventos com
  // `end` mantêm o horário.
  const fcEvents = events.map((e) => {
    const start = toSPWallClock(e.start)

    // Sentinela de fim de dia: 23:59 SP sem `end` → all-day.
    const isEndOfDaySentinel = e.end == null && start.slice(11, 16) === '23:59'
    if (isEndOfDaySentinel) {
      return {
        id: e.id,
        title: e.title,
        start: start.slice(0, 10),
        allDay: true,
        backgroundColor: e.color,
        borderColor: e.color,
        extendedProps: { source: e },
      }
    }

    let end: string
    if (e.end != null) {
      end = toSPWallClock(e.end)
    } else {
      const oneHourLater = toSPWallClock(new Date(e.start.getTime() + ONE_HOUR_MS))
      const sameDay = oneHourLater.slice(0, 10) === start.slice(0, 10)
      end = sameDay ? oneHourLater : `${start.slice(0, 10)}T23:59:59`
    }
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      allDay: false,
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
