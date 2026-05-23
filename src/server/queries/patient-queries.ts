import { listPatients, findPatientById } from '@/server/repositories/patient-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export async function getPatients(clientId: string, filters?: { search?: string }) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'patients', 'read')
  return listPatients(ctx, clientId, filters)
}

export async function getPatient(patientId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'patients', 'read')
  return findPatientById(ctx, patientId)
}
