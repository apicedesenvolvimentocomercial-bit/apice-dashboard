import type { Metadata } from 'next'

import { AppointmentsCalendarToggle } from '@/components/clinic/appointments/appointments-calendar-toggle'
import { ClinicUserCalendar } from '@/components/clinic/calendar/clinic-user-calendar'
import { getClinicCalendar } from '@/domains/clinic/calendar/calendar-queries'
import { AppointmentsCalendar } from '@/modules/appointments/appointments-calendar'
import { auth } from '@/server/auth'
import { getAppointments, getProcedures } from '@/server/queries/appointment-queries'
import { getPatients } from '@/server/queries/patient-queries'
import { getClinicSchedule } from '@/server/repositories/clinic-schedule-repository'

export const metadata: Metadata = { title: 'Agendamentos' }

export default async function ClientAppointmentsPage() {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  // Janela do calendário pessoal = mês corrente.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [appointments, patients, procedures, schedule, calendar] = await Promise.all([
    getAppointments(clientId),
    getPatients(clientId),
    getProcedures(clientId),
    getClinicSchedule(clientId),
    getClinicCalendar({ from, to }),
  ])

  return (
    <div className="space-y-6">
      <AppointmentsCalendarToggle
        appointmentsSlot={
          <AppointmentsCalendar
            appointments={appointments}
            patients={patients}
            procedures={procedures}
            clientId={clientId}
            schedule={schedule}
            hideTitle
          />
        }
        calendarSlot={<ClinicUserCalendar events={calendar.events} holidays={calendar.holidays} />}
      />
    </div>
  )
}
