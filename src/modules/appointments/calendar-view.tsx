'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core'

import { STATUS_COLORS } from './types'
import type { AppointmentEvent } from './types'

type Props = {
  appointments: AppointmentEvent[]
  onEventClick: (appointment: AppointmentEvent) => void
  onDateSelect: (dateStr: string) => void
}

export function CalendarView({ appointments, onEventClick, onDateSelect }: Props) {
  const events = appointments.map((apt) => {
    const start = new Date(apt.scheduledAt)
    const end = new Date(start.getTime() + apt.durationMinutes * 60_000)
    return {
      id: apt.id,
      title: `${apt.patient.name} — ${apt.procedure.name}`,
      start,
      end,
      backgroundColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      borderColor: STATUS_COLORS[apt.status] ?? '#6b7280',
      extendedProps: { appointment: apt },
    }
  })

  function handleEventClick(info: EventClickArg) {
    const apt = info.event.extendedProps.appointment as AppointmentEvent
    onEventClick(apt)
  }

  function handleDateSelect(info: DateSelectArg) {
    // Format to datetime-local string
    const dt = new Date(info.start)
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    onDateSelect(dateStr)
  }

  return (
    <div className="fc-wrapper">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView="timeGridWeek"
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
        events={events}
        eventClick={handleEventClick}
        selectable={true}
        select={handleDateSelect}
        height="auto"
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        allDaySlot={false}
        nowIndicator={true}
        eventDisplay="block"
        dayMaxEvents={3}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />
    </div>
  )
}
