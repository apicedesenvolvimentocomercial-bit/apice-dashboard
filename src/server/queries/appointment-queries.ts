import type { AppointmentStatus } from '@prisma/client'

import { listAppointments, findAppointmentById } from '@/server/repositories/appointment-repository'
import { listProceduresForSelect } from '@/server/repositories/procedure-repository'
import { getTenantContext } from '@/server/tenant/context'

export async function getAppointments(
  clientId: string,
  filters?: { from?: Date; to?: Date; status?: AppointmentStatus }
) {
  const ctx = await getTenantContext()
  return listAppointments(ctx, clientId, filters)
}

export async function getAppointment(appointmentId: string) {
  const ctx = await getTenantContext()
  return findAppointmentById(ctx, appointmentId)
}

export async function getProcedures(clientId: string) {
  const ctx = await getTenantContext()
  return listProceduresForSelect(ctx, clientId)
}
