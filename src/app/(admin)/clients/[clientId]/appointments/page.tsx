import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { ClientClinicCalendar } from '@/components/admin/clients/client-clinic-calendar'
import { AppointmentsCalendarToggle } from '@/components/clinic/appointments/appointments-calendar-toggle'
import { AppointmentsCalendar } from '@/modules/appointments/appointments-calendar'
import { getAppointments, getProcedures } from '@/server/queries/appointment-queries'
import { getClient } from '@/server/queries/client-queries'
import { getClientClinicCalendar } from '@/server/queries/client-clinic-queries'
import { getPatients } from '@/server/queries/patient-queries'
import { getClinicSchedule } from '@/server/repositories/clinic-schedule-repository'

export const metadata: Metadata = { title: 'Agendamentos' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientAppointmentsPage({ params }: Props) {
  const { clientId } = await params

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [client, appointments, patients, procedures, schedule, calendar] = await Promise.all([
    getClient(clientId),
    getAppointments(clientId),
    getPatients(clientId),
    getProcedures(clientId),
    getClinicSchedule(clientId),
    getClientClinicCalendar(clientId, { from, to }),
  ])

  if (!client) notFound()

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
        calendarSlot={
          <ClientClinicCalendar events={calendar.events} holidays={calendar.holidays} />
        }
      />
    </div>
  )
}
