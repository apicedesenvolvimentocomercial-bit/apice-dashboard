'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail, NotFoundError, validationFail } from '@/types/errors'
import { isValidCpf } from '@/lib/cpf'
import { MAX_CARD_NOTES } from '@/lib/masks'
import { assertCan } from '@/server/auth/assert-can'
import { can } from '@/server/auth/permissions'
import { resolveOwnerScope } from '@/server/auth/owner-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  listPatients,
  findPatientById,
  createPatient,
  updatePatient,
  softDeletePatient,
  quickSearchPatients,
} from '@/server/repositories/patient-repository'
import { findCommercialLeadForPatient } from '@/server/repositories/lead-repository'
import { listPipelines } from '@/server/repositories/pipeline-repository'
import {
  addPatientToRetention,
  removeRetentionCardForPatient,
} from '@/server/services/retention-service'
import { logger } from '@/lib/logger'

// feat1 — Cadastro manual exige os 5 campos. O MESMO schema vale para a edição
// manual (`updatePatientAction`): editar um paciente re-exige dados válidos
// (máscaras + `isValidCpf`), mantendo uma única definição de "paciente válido".
const createPatientSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório').max(255, 'Nome muito grande'),
  phone: z.string().min(1, 'Telefone obrigatório').max(20, 'Telefone inválido'),
  email: z.string().email('E-mail inválido').max(255, 'Email de tamanho inválido'),
  birthDate: z.string().min(1, 'Data de nascimento obrigatória').max(30, 'Data inválida'),
  cpf: z
    .string()
    .min(1, 'CPF obrigatório')
    .max(20, 'CPF inválido')
    .refine(isValidCpf, 'cpf inválido'),
  // Teto BAIXO de propósito: a observação é exibida no card do paciente junto
  // dos dados de contato e precisa caber em ≤4 linhas (ver MAX_CARD_NOTES).
  notes: z
    .string()
    .max(MAX_CARD_NOTES, 'Observação muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A nota contém caracteres inválidos'
    )
    .optional(),
  tags: z.array(z.string().max(100, 'Tag muito grande')).max(50, 'Muitas tags').optional(),
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
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'patients', 'read')
  const patients = await listPatients(ctx, clientId, search ? { search } : undefined)
  return ok(patients)
}

/**
 * Busca rápida do TOPBAR (redesign — handoff §3.1): até 6 pacientes por nome
 * (contains, case-insensitive) OU telefone (sequência de dígitos aparece no
 * formatado). Query vazia = "recentes" (última visita mais recente primeiro).
 * Payload mínimo — não substitui `listPatientsAction` (lista completa da aba).
 */
export async function searchPatientsQuickAction(clientId: string, query: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'patients', 'read')
  const rows = await quickSearchPatients(ctx, clientId, query.trim())
  return ok(rows)
}

export async function getPatientAction(patientId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'read')
  const patient = await findPatientById(ctx, clientId, patientId)
  if (!patient) return fail(new NotFoundError('Paciente'))
  return ok(patient)
}

/**
 * Card COMERCIAL ativo ligado ao paciente, p/ a busca do topbar (card unificado):
 * quem ainda é LEAD (paciente provisório criado ao agendar) abre o MESMO card do
 * funil comercial — não o card de paciente. `null` → sem card comercial ativo ou
 * sem leitura de CRM; o caller cai no card de paciente. As etapas voltam sem
 * cards (`leads: []`) — o drawer só usa a estrutura (etapa Perdeu etc.).
 */
export async function getPatientCommercialLeadContextAction(clientId: string, patientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'read')

  // O card de lead é do módulo CRM — sem leitura, cai no card de paciente.
  if (!(await can(ctx.userId, ctx.role, 'crm', 'read'))) return ok(null)

  const lead = await findCommercialLeadForPatient(ctx, clientId, patientId)
  if (!lead) return ok(null)

  const viewerId = await resolveOwnerScope(ctx, 'crm')
  const pipelines = await listPipelines(ctx, clientId, viewerId)
  return ok({
    leadId: lead.id,
    pipelineId: lead.stage.pipeline.id,
    pipelineKind: lead.stage.pipeline.kind,
    pipelineCategory: lead.stage.pipeline.category,
    stages: lead.stage.pipeline.stages.map((s) => ({ ...s, leads: [], totalLeads: 0 })),
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, category: p.category })),
  })
}

export async function createPatientAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'write')

  const parsed = createPatientSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const patient = await createPatient(ctx, clientId, {
    ...parsed.data,
    birthDate: new Date(parsed.data.birthDate),
  })

  // Item 6: paciente cadastrado manualmente entra na pipeline de Retenção na hora
  // e perde cards comerciais ativos duplicados. Best-effort: não bloqueia o
  // cadastro se a membresia falhar.
  try {
    await addPatientToRetention(clientId, ctx.organizationId, patient.id)
  } catch (err) {
    logger.error('addPatientToRetention failed', {
      error: err instanceof Error ? err.message : String(err),
      patientId: patient.id,
    })
  }

  revalidate(clientId)
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
  return ok(patient)
}

export async function updatePatientAction(patientId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'write')

  // Edição manual re-exige os 5 campos válidos (mesmo schema do cadastro).
  const parsed = createPatientSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  await updatePatient(ctx, patientId, clientId, {
    ...parsed.data,
    birthDate: new Date(parsed.data.birthDate),
  })
  revalidate(clientId)
  // O nome do paciente aparece no board de retenção (CRM) — revalida também lá.
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
  return ok(null)
}

export async function deletePatientAction(patientId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'patients', 'delete')
  await softDeletePatient(ctx, patientId, clientId)
  // feat3 — o card de retenção é atrelado ao paciente: removê-lo junto.
  await removeRetentionCardForPatient(clientId, ctx.organizationId, patientId)
  revalidate(clientId)
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
  return ok(null)
}
