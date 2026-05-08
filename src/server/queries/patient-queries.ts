import { listPatients, findPatientById } from '@/server/repositories/patient-repository'
import { getTenantContext } from '@/server/tenant/context'

export async function getPatients(clientId: string, filters?: { search?: string }) {
  const ctx = await getTenantContext()
  return listPatients(ctx, clientId, filters)
}

export async function getPatient(patientId: string) {
  const ctx = await getTenantContext()
  return findPatientById(ctx, patientId)
}
