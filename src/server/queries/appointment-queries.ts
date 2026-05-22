import type { AppointmentStatus } from '@prisma/client'

import { listAppointments, findAppointmentById } from '@/server/repositories/appointment-repository'
import { listProceduresForSelect } from '@/server/repositories/procedure-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export async function getAppointments(
  clientId: string,
  filters?: { from?: Date; to?: Date; status?: AppointmentStatus }
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'read')
  return listAppointments(ctx, clientId, filters)
}

export async function getAppointment(appointmentId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'appointments', 'read')
  return findAppointmentById(ctx, appointmentId)
}

export async function getProcedures(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'procedures', 'read')
  return listProceduresForSelect(ctx, clientId)
}
