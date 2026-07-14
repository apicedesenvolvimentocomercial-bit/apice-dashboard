'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core'
import { AlertTriangle, Clock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { toSPWallClock } from '@/lib/calendar-time'
import { clampEventToWindow, timeToMinutes } from '@/modules/appointments/clamp-event'
import type { AppointmentEvent, ClinicSchedule } from '@/modules/appointments/types'

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
 * FullCalendar dos AGENDAMENTOS com a skin do redesign (.senno-agenda no
 * wrapper do painel). O engine e as regras delicadas são os MESMOS do
 * calendar-view do módulo (usado pelo admin, que segue intocado): clamp de
 * evento fora do expediente, lead excluído piscando, seleção de slot p/
 * criar, "+N mais". A toolbar nativa do FC sai (headerToolbar=false) — o
 * painel controla período/visão por fora via handle.
 */

// Cancelado/faltou: sem cor de status na grade (cor é reservada a HOJE e
// FECHADO) — sinalizam por opacidade + nome riscado.
const MUTED_STATUSES = new Set(['CANCELED', 'NO_SHOW'])

type SennoEventProps = {
  appointment: AppointmentEvent
  realStart: string
  realEnd: string
  clamped: boolean
  leadDeleted: boolean
}

type Props = {
  appointments: AppointmentEvent[]
  schedule: ClinicSchedule
  view: AgendaView
  onApi: (api: AgendaCalendarApi) => void
  onDatesChange: (info: AgendaDatesInfo) => void
  onEventClick: (appointment: AppointmentEvent) => void
  onDateSelect: (dateStr: string) => void
}

export function SennoAppointmentsCalendar({
  appointments,
  schedule,
  view,
  onApi,
  onDatesChange,
  onEventClick,
  onDateSelect,
}: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<{ cs: number; ce: number } | null>(null)

  // Resize observer para sidebar toggle / troca de aba.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => calendarRef.current?.getApi().updateSize())
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Visão vem do seletor externo (toolbar); Lista usa a janela da Semana.
  // `changeView` faz flushSync interno — dentro do useEffect (commit) o React
  // 19 reclama ("flushSync from inside a lifecycle method"); adia p/ microtask.
  useEffect(() => {
    const target = AGENDA_FC_VIEW[view]
    queueMicrotask(() => {
      const api = calendarRef.current?.getApi()
      if (api && api.view.type !== target) api.changeView(target)
    })
  }, [view])

  // Handle p/ as setas/"Hoje" da toolbar.
  useEffect(() => {
    onApi({
      prev: () => calendarRef.current?.getApi().prev(),
      next: () => calendarRef.current?.getApi().next(),
      today: () => calendarRef.current?.getApi().today(),
    })
  }, [onApi])

  // Fantasma de slot (feedback 2026-07-09): bloco de 30min que segue o mouse
  // nos horários VAZIOS do timeGrid, sinalizando "clique p/ criar" — o FC não
  // tem hover por slot (as colunas são um overlay contínuo), então o bloco é
  // posicionado por JS, snapado à grade de 33px (30min), e some sobre eventos.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const SLOT_PX = 33
    const ghost = document.createElement('div')
    ghost.className = 'senno-slot-ghost'
    ghost.style.display = 'none'
    let host: HTMLElement | null = null

    const hide = () => {
      ghost.style.display = 'none'
    }
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (
        !target ||
        target.closest('.fc-event, .fc-timegrid-more-link, .fc-popover') ||
        !target.closest('.fc-timegrid-body')
      ) {
        hide()
        return
      }
      // Em área vazia o alvo do mouse é a LANE (linha inteira, camada de
      // fundo), não a coluna — a coluna do dia é resolvida geometricamente.
      let frame: HTMLElement | null = null
      let rect: DOMRect | null = null
      for (const f of root.querySelectorAll<HTMLElement>('.fc-timegrid-col-frame')) {
        const r = f.getBoundingClientRect()
        if (
          e.clientX >= r.left &&
          e.clientX < r.right &&
          e.clientY >= r.top &&
          e.clientY < r.bottom
        ) {
          frame = f
          rect = r
          break
        }
      }
      if (!frame || !rect) {
        hide()
        return
      }
      // A troca de visão recria o DOM do FC — reanexa se o host mudou/morreu.
      if (host !== frame || !ghost.isConnected) {
        host = frame
        frame.appendChild(ghost)
      }
      const slotTop = Math.floor((e.clientY - rect.top) / SLOT_PX) * SLOT_PX
      ghost.style.top = `${Math.max(0, Math.min(slotTop, frame.clientHeight - SLOT_PX))}px`
      ghost.style.display = 'block'
    }
    root.addEventListener('mousemove', onMove)
    root.addEventListener('mouseleave', hide)
    return () => {
      root.removeEventListener('mousemove', onMove)
      root.removeEventListener('mouseleave', hide)
      ghost.remove()
    }
  }, [])

  const minMin = timeToMinutes(schedule.workdayStart)
  const maxMin = timeToMinutes(schedule.workdayEnd)

  const events = useMemo(
    () =>
      appointments.map((apt) => {
        const start = new Date(apt.scheduledAt)
        const end = new Date(start.getTime() + apt.durationMinutes * 60_000)
        // feat4: Lead excluído → o agendamento pisca um aviso.
        const leadDeleted = apt.lead?.deletedAt != null

        const startWall = toSPWallClock(start)
        const endWall = toSPWallClock(end)
        // Encosta no expediente quando agendado fora dele (senão sumia do grid).
        const win = clampEventToWindow(startWall, endWall, minMin, maxMin)

        const classNames: string[] = []
        if (leadDeleted) classNames.push('fc-event-lead-deleted')
        if (win.clamped) classNames.push('fc-event-clamped')

        return {
          id: apt.id,
          title: `${apt.patient.name} — ${apt.procedure.name}`,
          start: win.start,
          end: win.end,
          classNames,
          extendedProps: {
            appointment: apt,
            // Horário REAL (o bloco pode estar clampado na borda do grid).
            realStart: startWall.slice(11, 16),
            realEnd: endWall.slice(11, 16),
            clamped: win.clamped,
            leadDeleted,
          } satisfies SennoEventProps,
        }
      }),
    [appointments, minMin, maxMin]
  )

  // Feriados como background events (tinta dourada 0.12 via .fc-bg-holiday).
  const holidayEvents = useMemo(
    () =>
      schedule.holidays.map((h) => ({
        id: `holiday-${h.id}`,
        start: h.date,
        allDay: true,
        display: 'background' as const,
        classNames: ['fc-bg-holiday'],
        extendedProps: { isHoliday: true, holidayName: h.name },
      })),
    [schedule.holidays]
  )

  // Hachura de fechado só no período corrente (dias fora do mês ficam sem).
  const closedDayEvents = useMemo(
    () =>
      range
        ? buildClosedDayBgEvents(new Date(range.cs), new Date(range.ce), schedule.workdays)
        : [],
    [range, schedule.workdays]
  )

  // Contagem por dia p/ o cabeçalho da visão Dia ("N agendamentos").
  const dayCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const apt of appointments) {
      const key = toSPWallClock(new Date(apt.scheduledAt)).slice(0, 10)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [appointments])

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
    const apt = info.event.extendedProps.appointment as AppointmentEvent
    if (apt) onEventClick(apt)
  }

  function handleDateSelect(info: DateSelectArg) {
    const dt = new Date(info.start)
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    onDateSelect(dateStr)
  }

  // Thresholds do protótipo (§12): Dia compacto <45min; Semana mini <55min —
  // limiares propositalmente DIFERENTES, não unificar.
  function eventClassNames(arg: EventContentArg): string[] {
    const apt = arg.event.extendedProps.appointment as AppointmentEvent | undefined
    if (!apt) return []
    const cls: string[] = []
    if (MUTED_STATUSES.has(apt.status)) cls.push('senno-ev-muted')
    if (arg.view.type === 'timeGridWeek' && apt.durationMinutes < 55) cls.push('senno-appt-mini')
    if (arg.view.type === 'timeGridDay' && apt.durationMinutes < 45) cls.push('senno-ev-is-compact')
    return cls
  }

  function renderEventContent(arg: EventContentArg) {
    const xp = arg.event.extendedProps as Partial<SennoEventProps>
    const apt = xp.appointment
    if (!apt) return undefined // background events (fechado/feriado)

    const name = xp.leadDeleted ? `Lead excluído — ${apt.patient.name}` : apt.patient.name
    const extra =
      apt.procedureIds && apt.procedureIds.length > 1 ? ` +${apt.procedureIds.length - 1}` : ''
    const proc = `${apt.procedure.name}${extra}`
    const flags = (
      <>
        {xp.clamped && <Clock className="h-[10px] w-[10px] flex-none" aria-hidden="true" />}
        {xp.leadDeleted && (
          <AlertTriangle
            className="h-[10px] w-[10px] flex-none text-destructive"
            aria-hidden="true"
          />
        )}
      </>
    )

    if (arg.view.type === 'dayGridMonth') {
      return (
        <span className="senno-chip">
          <span className="senno-chip-time">{xp.realStart}</span>
          <span className="senno-chip-title">
            {name} — {proc}
          </span>
        </span>
      )
    }

    const timeRange = `${xp.realStart} – ${xp.realEnd}`

    if (arg.view.type === 'timeGridDay') {
      if (apt.durationMinutes < 45) {
        return (
          <span className="senno-ev-compact">
            <span className="senno-ev-time">
              {flags}
              {timeRange}
            </span>
            <span className="senno-ev-name">{name}</span>
          </span>
        )
      }
      return (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-baseline">
            <span className="senno-ev-time">
              {flags}
              {timeRange}
            </span>
            <span className="senno-ev-dur">{apt.durationMinutes} min</span>
          </span>
          <span className="senno-ev-name">{name}</span>
          <span className="senno-ev-proc">{proc}</span>
        </span>
      )
    }

    // Semana (e mini)
    return (
      <span className="flex min-w-0 flex-col gap-px">
        <span className="senno-ev-time">
          {flags}
          {timeRange}
        </span>
        <span className="senno-ev-name">{name}</span>
        <span className="senno-ev-proc">{proc}</span>
      </span>
    )
  }

  return (
    <div ref={containerRef} className="senno-agenda-selectable">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={AGENDA_FC_VIEW[view]}
        locale={ptBrLocale}
        headerToolbar={false}
        views={AGENDA_FC_VIEWS_CONFIG}
        events={[...events, ...holidayEvents, ...closedDayEvents]}
        eventClick={handleEventClick}
        selectable={true}
        select={handleDateSelect}
        height="auto"
        slotMinTime={schedule.workdayStart + ':00'}
        slotMaxTime={schedule.workdayEnd + ':00'}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        allDaySlot={false}
        nowIndicator={true}
        eventDisplay="block"
        dayMaxEvents={3}
        // Agendamentos no mesmo horário lado a lado; excedente vira "+N".
        slotEventOverlap={false}
        eventMaxStack={3}
        datesSet={handleDatesSet}
        dayHeaderContent={agendaDayHeaderContent({
          workdays: schedule.workdays,
          dayCounts,
          countNoun: 'agendamento',
        })}
        dayHeaderClassNames={agendaDayHeaderClassNames(schedule.workdays)}
        eventClassNames={eventClassNames}
        eventContent={renderEventContent}
      />
    </div>
  )
}
