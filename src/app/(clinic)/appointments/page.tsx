import type { Metadata } from 'next'

import { AgendaShell } from '@/components/clinic/appointments/agenda-shell'
import {
  getClinicAppointments,
  getClinicAppointmentProcedures,
  getClinicScheduleConfig,
} from '@/domains/clinic/appointments/appointment-queries'
import { getClinicCalendar } from '@/domains/clinic/calendar/calendar-queries'
import { getClinicPatients } from '@/domains/clinic/patients/patient-queries'
import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'

export const metadata: Metadata = { title: 'Agenda' }

export default async function ClientAppointmentsPage() {
  await gateClinicTab('appointments')
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  // Janela inicial do calendário pessoal = mês corrente; navegar de período
  // refaz o fetch da janela visível no client (painel Calendário).
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [appointments, patients, procedures, schedule, calendar] = await Promise.all([
    getClinicAppointments(),
    getClinicPatients(),
    getClinicAppointmentProcedures(),
    getClinicScheduleConfig(),
    getClinicCalendar({ from, to }),
  ])
  return (
    <AgendaShell
      clientId={clientId}
      appointments={appointments}
      patients={patients}
      procedures={procedures}
      schedule={schedule}
      calendarEvents={calendar.events}
      calendarHolidays={calendar.holidays}
    />
  )
}
