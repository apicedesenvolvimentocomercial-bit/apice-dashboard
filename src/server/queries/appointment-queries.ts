import type { AppointmentStatus } from '@prisma/client'

import { listAppointments, findAppointmentById } from '@/server/repositories/appointment-repository'
import { listProceduresForSelect } from '@/server/repositories/procedure-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertCan } from '@/server/auth/assert-can'

export async function getAppointments(
  clientId: string,
  filters?: { from?: Date; to?: Date; status?: AppointmentStatus }
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'appointments', 'read')
  return listAppointments(ctx, clientId, filters)
}

export async function getAppointment(clientId: string, appointmentId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'read')
  return findAppointmentById(ctx, clientId, appointmentId)
}

export async function getProcedures(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'procedures', 'read')
  return listProceduresForSelect(ctx, clientId)
}
