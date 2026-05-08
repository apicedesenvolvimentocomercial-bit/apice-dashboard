import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { getClient } from '@/server/queries/client-queries'
import { getAppointments, getProcedures } from '@/server/queries/appointment-queries'
import { getPatients } from '@/server/queries/patient-queries'
import { AppointmentsCalendar } from '@/modules/appointments/appointments-calendar'

export const metadata: Metadata = { title: 'Agendamentos' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientAppointmentsPage({ params }: Props) {
  const { clientId } = await params
  const [client, appointments, patients, procedures] = await Promise.all([
    getClient(clientId),
    getAppointments(clientId),
    getPatients(clientId),
    getProcedures(clientId),
  ])

  if (!client) notFound()

  return (
    <div className="space-y-6">
      <AppointmentsCalendar
        appointments={appointments}
        patients={patients}
        procedures={procedures}
        clientId={clientId}
      />
    </div>
  )
}
