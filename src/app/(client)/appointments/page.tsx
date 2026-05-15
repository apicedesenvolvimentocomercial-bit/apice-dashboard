import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { getAppointments, getProcedures } from '@/server/queries/appointment-queries'
import { getPatients } from '@/server/queries/patient-queries'
import { getClinicSchedule } from '@/server/repositories/clinic-schedule-repository'
import { AppointmentsCalendar } from '@/modules/appointments/appointments-calendar'

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

  const [appointments, patients, procedures, schedule] = await Promise.all([
    getAppointments(clientId),
    getPatients(clientId),
    getProcedures(clientId),
    getClinicSchedule(clientId),
  ])

  return (
    <div className="space-y-6">
      <AppointmentsCalendar
        appointments={appointments}
        patients={patients}
        procedures={procedures}
        clientId={clientId}
        schedule={schedule}
      />
    </div>
  )
}
