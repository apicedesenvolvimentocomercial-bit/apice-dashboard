'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail, NotFoundError } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  listPatients,
  findPatientById,
  createPatient,
  updatePatient,
  softDeletePatient,
} from '@/server/repositories/patient-repository'

const patientSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/patients')
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/patients`)
  revalidatePath(`/clients/${clientId}/appointments`)
}

export async function listPatientsAction(clientId: string, search?: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'patients', 'read')
  const patients = await listPatients(ctx, clientId, search ? { search } : undefined)
  return ok(patients)
}

export async function getPatientAction(patientId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'patients', 'read')
  const patient = await findPatientById(ctx, patientId)
  if (!patient) return fail(new NotFoundError('Paciente'))
  return ok(patient)
}

export async function createPatientAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'patients', 'write')

  const parsed = patientSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const patient = await createPatient(ctx, clientId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
    birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined,
  })
  revalidate(clientId)
  return ok(patient)
}

export async function updatePatientAction(patientId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'patients', 'write')

  const parsed = patientSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updatePatient(ctx, patientId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
    birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function deletePatientAction(patientId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'patients', 'delete')
  await softDeletePatient(ctx, patientId)
  revalidate(clientId)
  return ok(null)
}
