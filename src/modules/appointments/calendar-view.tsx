'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core'
import { useEffect, useRef, useState } from 'react'

import { toSPWallClock } from '@/lib/calendar-time'

import { STATUS_COLORS, DEFAULT_SCHEDULE } from './types'
import type { AppointmentEvent, ClinicSchedule } from './types'

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type Props = {
  appointments: AppointmentEvent[]
  schedule?: ClinicSchedule
  onEventClick: (appointment: AppointmentEvent) => void
  onDateSelect: (dateStr: string) => void
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function CalendarView({
  appointments,
  schedule = DEFAULT_SCHEDULE,
  onEventClick,
  onDateSelect,
}: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAfterWorkday, setIsAfterWorkday] = useState(false)

  // Resize observer para sidebar toggle
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => calendarRef.current?.getApi().updateSize())
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Verifica se já passou do expediente
  useEffect(() => {
    function check() {
      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      setIsAfterWorkday(currentMinutes >= timeToMinutes(schedule.workdayEnd))
    }
    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [schedule.workdayEnd])

  const events = appointments.map((apt) => {
    const start = new Date(apt.scheduledAt)
    const end = new Date(start.getTime() + apt.durationMinutes * 60_000)
    return {
      id: apt.id,
      title: `${apt.patient.name} — ${apt.procedure.name}`,
      start: toSPWallClock(start),
      end: toSPWallClock(end),
      backgroundColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      borderColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      extendedProps: { appointment: apt },
    }
  })

  // Feriados como background events (cor cinza-azulada para indicar inatividade)
  const holidayEvents = schedule.holidays.map((h) => ({
    id: `holiday-${h.id}`,
    start: h.date,
    allDay: true,
    display: 'background' as const,
    backgroundColor: '#e2e8f0',
    extendedProps: { isHoliday: true, holidayName: h.name },
  }))

  // Dias fechados (não estão em workdays) → background events na semana visível
  // FullCalendar businessHours já cobre isso, mas background events
  // reforçam visualmente os dias fechados com uma cor diferente.
  const closedDayEvents = (() => {
    const result: object[] = []
    const today = new Date()
    for (let w = -4; w <= 4; w++) {
      for (let d = 0; d < 7; d++) {
        if (!schedule.workdays.includes(d)) {
          const date = new Date(today)
          date.setDate(today.getDate() - today.getDay() + d + w * 7)
          const dateStr = date.toISOString().slice(0, 10)
          result.push({
            id: `closed-${dateStr}`,
            start: dateStr,
            allDay: true,
            display: 'background',
            backgroundColor: '#f1f5f9',
          })
        }
      }
    }
    return result
  })()

  function handleEventClick(info: EventClickArg) {
    if (info.event.extendedProps.isHoliday) return
    const apt = info.event.extendedProps.appointment as AppointmentEvent
    if (apt) onEventClick(apt)
  }

  function handleDateSelect(info: DateSelectArg) {
    const dt = new Date(info.start)
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    onDateSelect(dateStr)
  }

  const closedDayNumbers = Array.from({ length: 7 }, (_, i) => i).filter(
    (d) => !schedule.workdays.includes(d)
  )

  return (
    <div ref={containerRef}>
      <div className="fc-wrapper">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          locale={ptBrLocale}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' }}
          events={[...events, ...holidayEvents, ...closedDayEvents]}
          eventClick={handleEventClick}
          selectable={true}
          select={handleDateSelect}
          height="auto"
          slotMinTime={schedule.workdayStart + ':00'}
          slotMaxTime={schedule.workdayEnd + ':00'}
          allDaySlot={false}
          nowIndicator={true}
          eventDisplay="block"
          dayMaxEvents={3}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
          hiddenDays={closedDayNumbers}
          businessHours={{
            daysOfWeek: schedule.workdays,
            startTime: schedule.workdayStart,
            endTime: schedule.workdayEnd,
          }}
        />
      </div>

      {/* Banner "Fim de expediente" quando hora atual >= workdayEnd */}
      {isAfterWorkday && (
        <div className="mt-0 flex items-center justify-center gap-2 border-t-2 border-red-400 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Fim de expediente — {schedule.workdayEnd}
        </div>
      )}

      {/* Legenda dos dias de feriado */}
      {schedule.holidays.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-slate-200" />
            Feriado
          </span>
          {schedule.holidays.map((h) => (
            <span key={h.id} className="flex items-center gap-1">
              <span className="font-medium">{h.date}</span> — {h.name}
            </span>
          ))}
        </div>
      )}

      {/* Legenda dos dias fechados */}
      {closedDayNumbers.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>Fechado:</span>
          {closedDayNumbers.map((d) => (
            <span key={d} className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
              {DAY_NAMES[d]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
