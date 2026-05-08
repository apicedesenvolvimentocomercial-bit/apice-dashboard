import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { getPatients } from '@/server/queries/patient-queries'
import { PatientsList } from '@/modules/patients/patients-list'

export const metadata: Metadata = { title: 'Pacientes' }

export default async function ClientPatientsPage() {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const patients = await getPatients(clientId)

  return (
    <div className="space-y-6">
      <PatientsList patients={patients} clientId={clientId} />
    </div>
  )
}
