'use client'

import { useState } from 'react'

import type { AppointmentEvent, ClinicSchedule } from '@/modules/appointments/types'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'
import type { CalendarEvent, CalendarHoliday } from '@/shared/calendar-types'

import { AgendaAppointmentsPanel } from './agenda-appointments-panel'
import type { AgendaView } from './agenda-fc-shared'
import { AgendaPersonalPanel } from './agenda-personal-panel'
import { useAgendaTab, type AgendaTab } from './use-agenda-tab'

type Props = {
  clientId: string
  appointments: AppointmentEvent[]
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  schedule: ClinicSchedule
  calendarEvents: CalendarEvent[]
  calendarHolidays: CalendarHoliday[]
}

/**
 * Shell da Agenda redesenhada. A aba ativa (Agendamentos × Calendário) vem da
 * URL (as abas ficam no TOPBAR, no lugar do h1 — agenda-handoff §3.1); cada
 * aba lembra a própria última visão (§4.3: views.agendamentos ≠
 * views.calendario; estado inicial Agendamentos=Semana, Calendário=Mês).
 */
export function AgendaShell({
  clientId,
  appointments,
  patients,
  procedures,
  schedule,
  calendarEvents,
  calendarHolidays,
}: Props) {
  const { tab } = useAgendaTab()
  const [views, setViews] = useState<Record<AgendaTab, AgendaView>>({
    agendamentos: 'semana',
    calendario: 'mes',
  })

  const setView = (v: AgendaView) => setViews((s) => ({ ...s, [tab]: v }))

  if (tab === 'calendario') {
    return (
      <AgendaPersonalPanel
        initialEvents={calendarEvents}
        initialHolidays={calendarHolidays}
        schedule={schedule}
        view={views.calendario}
        onViewChange={setView}
      />
    )
  }

  return (
    <AgendaAppointmentsPanel
      clientId={clientId}
      appointments={appointments}
      patients={patients}
      procedures={procedures}
      schedule={schedule}
      view={views.agendamentos}
      onViewChange={setView}
    />
  )
}
