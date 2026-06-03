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

const MIN_VISIBLE_BLOCK = 20 // minutos: altura mínima garantida p/ evento clampado

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Encaixa um evento [startWall,endWall] (strings SP "YYYY-MM-DDTHH:mm:ss") dentro
// da janela do expediente [minMin,maxMin] (minutos do dia). O grid do timeGrid é
// limitado ao expediente (slotMinTime/slotMaxTime), então um evento agendado fora
// dele (ex.: 20:00 com expediente até 18:00) NÃO renderiza — cai fora do eixo.
// Aqui encostamos no fim (ou início) do expediente, preservando a data e
// garantindo bloco visível mínimo. `clamped` sinaliza p/ mostrar o horário real
// no título (não mentir a hora).
function clampEventToWindow(
  startWall: string,
  endWall: string,
  minMin: number,
  maxMin: number
): { start: string; end: string; clamped: boolean } {
  const date = startWall.slice(0, 10)
  let startMin = Number(startWall.slice(11, 13)) * 60 + Number(startWall.slice(14, 16))
  let endMin =
    endWall.slice(0, 10) === date
      ? Number(endWall.slice(11, 13)) * 60 + Number(endWall.slice(14, 16))
      : maxMin // cruza a meia-noite → corta no fim do expediente
  const windowLen = Math.max(MIN_VISIBLE_BLOCK, maxMin - minMin)
  const block = Math.min(Math.max(endMin - startMin, MIN_VISIBLE_BLOCK), windowLen)
  let clamped = false
  if (startMin >= maxMin) {
    // Depois do expediente → encosta no fim.
    endMin = maxMin
    startMin = Math.max(minMin, maxMin - block)
    clamped = true
  } else if (startMin < minMin) {
    // Antes do expediente → encosta no início.
    startMin = minMin
    endMin = Math.min(maxMin, minMin + block)
    clamped = true
  } else if (endMin > maxMin) {
    // Começou dentro mas transborda → corta no fim.
    endMin = maxMin
    clamped = true
  }
  const fmt = (mins: number) => `${date}T${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}:00`
  return { start: fmt(startMin), end: fmt(endMin), clamped }
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

  const minMin = timeToMinutes(schedule.workdayStart)
  const maxMin = timeToMinutes(schedule.workdayEnd)

  const events = appointments.map((apt) => {
    const start = new Date(apt.scheduledAt)
    const end = new Date(start.getTime() + apt.durationMinutes * 60_000)
    // feat4: Lead excluído → o agendamento pisca um aviso vermelho.
    const leadDeleted = apt.lead?.deletedAt != null

    const realTime = toSPWallClock(start).slice(11, 16)
    // Encosta no expediente quando agendado fora dele (senão sumia do grid).
    const win = clampEventToWindow(toSPWallClock(start), toSPWallClock(end), minMin, maxMin)

    // Combo: nome do principal + "+N" quando há mais de um procedimento.
    const extraProc =
      apt.procedureIds && apt.procedureIds.length > 1 ? ` +${apt.procedureIds.length - 1}` : ''
    const baseTitle = leadDeleted
      ? `⚠ Lead excluído — ${apt.patient.name}`
      : `${apt.patient.name} — ${apt.procedure.name}${extraProc}`
    const classNames: string[] = []
    if (leadDeleted) classNames.push('fc-event-lead-deleted')
    if (win.clamped) classNames.push('fc-event-clamped')

    return {
      id: apt.id,
      // Evento clampado mostra o horário real no título — o bloco está na borda
      // do expediente, mas a hora marcada é a verdadeira.
      title: win.clamped ? `⏰ ${realTime} · ${baseTitle}` : baseTitle,
      start: win.start,
      end: win.end,
      backgroundColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      borderColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      classNames,
      extendedProps: { appointment: apt },
    }
  })

  // Feriados como background events. A cor vem de classe + token semântico
  // (`globals.css`), não inline — assim cascateia no dark sem ficar clara demais.
  const holidayEvents = schedule.holidays.map((h) => ({
    id: `holiday-${h.id}`,
    start: h.date,
    allDay: true,
    display: 'background' as const,
    classNames: ['fc-bg-holiday'],
    extendedProps: { isHoliday: true, holidayName: h.name },
  }))

  // Dias fechados (não estão em workdays) → background events.
  // Os dias permanecem visíveis na agenda (não usamos hiddenDays), apenas
  // pintados com uma cor que remete a "fechado/inativo". Cobrimos uma janela
  // ampla (±26 semanas) para que a marcação apareça ao navegar entre meses.
  const closedDayEvents = (() => {
    const result: object[] = []
    const today = new Date()
    for (let w = -26; w <= 26; w++) {
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
            classNames: ['fc-bg-closed'],
            extendedProps: { isClosed: true },
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
          // Aba dia/semana (timeGrid): agendamentos no mesmo horário ficam lado
          // a lado (não sobrepostos) com um pequeno respiro entre eles (CSS). Se
          // não couberem, o excedente colapsa num link "+N" que abre o popover.
          slotEventOverlap={false}
          eventMaxStack={3}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
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
            <span className="inline-block h-3 w-3 rounded bg-muted" />
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
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-secondary" />
            Fechado:
          </span>
          {closedDayNumbers.map((d) => (
            <span key={d} className="rounded bg-muted px-1 py-0.5 text-muted-foreground">
              {DAY_NAMES[d]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
