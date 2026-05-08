import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { getClient } from '@/server/queries/client-queries'
import { getPatients } from '@/server/queries/patient-queries'
import { PatientsList } from '@/modules/patients/patients-list'

export const metadata: Metadata = { title: 'Pacientes' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientPatientsPage({ params }: Props) {
  const { clientId } = await params
  const [client, patients] = await Promise.all([getClient(clientId), getPatients(clientId)])

  if (!client) notFound()

  return (
    <div className="space-y-6">
      <PatientsList patients={patients} clientId={clientId} />
    </div>
  )
}
