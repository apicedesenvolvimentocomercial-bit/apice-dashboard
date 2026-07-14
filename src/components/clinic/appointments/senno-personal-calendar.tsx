'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core'
import { useEffect, useMemo, useRef, useState } from 'react'

import { mapCalendarEventToFc } from '@/components/shared/calendar/fc-event-mapping'
import type { CalendarEvent, CalendarHoliday } from '@/shared/calendar-types'

import {
  AGENDA_FC_VIEW,
  AGENDA_FC_VIEWS_CONFIG,
  agendaDayHeaderClassNames,
  agendaDayHeaderContent,
  buildClosedDayBgEvents,
  type AgendaCalendarApi,
  type AgendaDatesInfo,
  type AgendaView,
} from './agenda-fc-shared'

/**
 * FullCalendar do CALENDÁRIO PESSOAL da clínica com a skin do redesign.
 * Mesmo mapeamento de eventos do CalendarInner (sentinela fim-do-dia →
 * all-day; sem fim → 1h clampada no dia) via helper compartilhado. A cor
 * escolhida pelo usuário vira um PONTO de etiqueta dentro do tratamento
 * dourado único (cor de superfície segue reservada a HOJE/FECHADO). Grade de
 * dia/semana cobre as 24h — evento pessoal não é limitado ao expediente.
 */
type Props = {
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  /** Dias de expediente da clínica — só p/ a hachura visual de "fechado". */
  workdays: number[]
  view: AgendaView
  onApi: (api: AgendaCalendarApi) => void
  onDatesChange: (info: AgendaDatesInfo) => void
  onEventClick: (eventId: string) => void
}

export function SennoPersonalCalendar({
  events,
  holidays,
  workdays,
  view,
  onApi,
  onDatesChange,
  onEventClick,
}: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<{ cs: number; ce: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => calendarRef.current?.getApi().updateSize())
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // `changeView` faz flushSync interno — dentro do useEffect (commit) o React
  // 19 reclama ("flushSync from inside a lifecycle method"); adia p/ microtask.
  useEffect(() => {
    const target = AGENDA_FC_VIEW[view]
    queueMicrotask(() => {
      const api = calendarRef.current?.getApi()
      if (api && api.view.type !== target) api.changeView(target)
    })
  }, [view])

  useEffect(() => {
    onApi({
      prev: () => calendarRef.current?.getApi().prev(),
      next: () => calendarRef.current?.getApi().next(),
      today: () => calendarRef.current?.getApi().today(),
    })
  }, [onApi])

  const fcEvents = useMemo(
    () =>
      events.map((e) => {
        const m = mapCalendarEventToFc(e)
        return {
          id: m.id,
          title: m.title,
          start: m.start,
          ...(m.end != null ? { end: m.end } : {}),
          allDay: m.allDay,
          extendedProps: {
            source: e,
            startLabel: m.allDay ? null : m.start.slice(11, 16),
            endLabel: m.allDay || m.end == null ? null : m.end.slice(11, 16),
          },
        }
      }),
    [events]
  )

  const holidayEvents = useMemo(
    () =>
      holidays.map((h) => ({
        id: `holiday-${h.id}`,
        start: h.date,
        allDay: true,
        display: 'background' as const,
        classNames: ['fc-bg-holiday'],
        extendedProps: { isHoliday: true, holidayName: h.name },
      })),
    [holidays]
  )

  const closedDayEvents = useMemo(
    () => (range ? buildClosedDayBgEvents(new Date(range.cs), new Date(range.ce), workdays) : []),
    [range, workdays]
  )

  // "N eventos" no cabeçalho da visão Dia.
  const dayCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of fcEvents) {
      const key = e.start.slice(0, 10)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [fcEvents])

  function handleDatesSet(arg: DatesSetArg) {
    setRange({ cs: arg.view.currentStart.getTime(), ce: arg.view.currentEnd.getTime() })
    onDatesChange({
      title: arg.view.title,
      viewType: arg.view.type,
      start: arg.start,
      end: arg.end,
      currentStart: arg.view.currentStart,
      currentEnd: arg.view.currentEnd,
    })
  }

  function handleEventClick(info: EventClickArg) {
    if (info.event.extendedProps.isHoliday || info.event.extendedProps.isClosed) return
    const source = info.event.extendedProps.source as CalendarEvent
    if (source) onEventClick(source.id)
  }

  function renderEventContent(arg: EventContentArg) {
    const xp = arg.event.extendedProps as {
      source?: CalendarEvent
      startLabel?: string | null
      endLabel?: string | null
    }
    const source = xp.source
    if (!source) return undefined // background events

    const dot = (
      <span className="senno-ev-dot" style={{ background: source.color }} aria-hidden="true" />
    )

    // Mês e faixa all-day: chip compacto.
    if (arg.view.type === 'dayGridMonth' || arg.event.allDay) {
      return (
        <span className="senno-chip">
          {dot}
          {xp.startLabel && <span className="senno-chip-time">{xp.startLabel}</span>}
          <span className="senno-chip-title">{source.title}</span>
        </span>
      )
    }

    const timeRange = xp.endLabel ? `${xp.startLabel} – ${xp.endLabel}` : xp.startLabel

    return (
      <span className="flex min-w-0 flex-col gap-px">
        <span className="senno-ev-time">
          {dot}
          {timeRange}
        </span>
        <span className="senno-ev-name">{source.title}</span>
      </span>
    )
  }

  return (
    <div ref={containerRef}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={AGENDA_FC_VIEW[view]}
        locale={ptBrLocale}
        headerToolbar={false}
        views={AGENDA_FC_VIEWS_CONFIG}
        events={[...fcEvents, ...holidayEvents, ...closedDayEvents]}
        eventClick={handleEventClick}
        height="auto"
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        nowIndicator={true}
        eventDisplay="block"
        dayMaxEvents={3}
        slotEventOverlap={false}
        eventMaxStack={3}
        datesSet={handleDatesSet}
        dayHeaderContent={agendaDayHeaderContent({
          workdays,
          dayCounts,
          countNoun: 'evento',
        })}
        dayHeaderClassNames={agendaDayHeaderClassNames(workdays)}
        eventContent={renderEventContent}
      />
    </div>
  )
}
