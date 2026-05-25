import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import { getClinicPatients } from '@/domains/clinic/patients/patient-queries'
import { PatientsList } from '@/modules/patients/patients-list'

export const metadata: Metadata = { title: 'Pacientes' }

export default async function ClientPatientsPage() {
  await gateClinicTab('patients')
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const patients = await getClinicPatients()

  return (
    <div className="space-y-6">
      <PatientsList patients={patients} clientId={clientId} />
    </div>
  )
}
