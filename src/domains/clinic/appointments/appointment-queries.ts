import type { AppointmentStatus } from '@prisma/client'

import { getClinicContext } from '@/server/auth/clinic-context'
import { getAppointments, getProcedures } from '@/server/queries/appointment-queries'
import { getClinicSchedule } from '@/server/repositories/clinic-schedule-repository'

/**
 * Portas de Agendamentos do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` vem
 * de `getClinicContext()`; reusam queries/repos compartilhados (já com guards).
 */
export async function getClinicAppointments(filters?: {
  from?: Date
  to?: Date
  status?: AppointmentStatus
}) {
  const { clientId } = await getClinicContext()
  return getAppointments(clientId, filters)
}

export async function getClinicAppointmentProcedures() {
  const { clientId } = await getClinicContext()
  return getProcedures(clientId)
}

export async function getClinicScheduleConfig() {
  const { clientId } = await getClinicContext()
  return getClinicSchedule(clientId)
}
