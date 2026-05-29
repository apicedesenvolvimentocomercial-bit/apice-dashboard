import { listPatients, findPatientById } from '@/server/repositories/patient-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertCan } from '@/server/auth/assert-can'

export async function getPatients(clientId: string, filters?: { search?: string }) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'read')
  return listPatients(ctx, clientId, filters)
}

export async function getPatient(clientId: string, patientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'read')
  return findPatientById(ctx, clientId, patientId)
}
