'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { NotFoundError, ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  createLead,
  createLeadForPatient,
  listPatientsWithoutExistingCard,
  updateLead,
  reorderLead,
  findLeadById,
  softDeleteLead,
} from '@/server/repositories/lead-repository'
import { winLead, loseLead, addInteraction } from '@/server/services/lead-service'
import {
  scheduleLeadAppointment,
  moveLeadWithEffect,
  regressLeadStage,
} from '@/server/services/pipeline-stage-effects'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { isTooOldToSchedule, parseScheduledAt } from '@/lib/date'

const leadSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  source: z.enum(['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL', 'WHATSAPP', 'WALK_IN', 'OTHER']),
  stageId: z.string().min(1),
  procedureInterest: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  notes: z.string().optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/crm')
  revalidatePath('/crm/clientes')
  revalidatePath(`/clients/${clientId}/crm`)
  revalidatePath(`/clients/${clientId}/crm/clientes`)
}

export async function createLeadAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'crm', 'write')

  const parsed = leadSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const lead = await createLead(ctx, clientId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  })
  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Lead',
    entityId: lead.id,
    changes: { name: lead.name, source: parsed.data.source },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ id: lead.id, stageId: lead.stageId, name: lead.name })
}

export async function updateLeadAction(leadId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const parsed = leadSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateLead(ctx, leadId, clientId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

/**
 * Move um lead aplicando os efeitos de etapa nativa (2b/2c) e detectando
 * retrocesso (2d). Retorna um payload de status que o cliente interpreta:
 *   - `{ status: 'moved' }` — move concluído (com efeito, se houver).
 *   - `{ status: 'needs-appointment' }` — etapa exige agendamento (sem appointment).
 *   - `{ status: 'confirm-regress' }` — retrocesso: cliente deve confirmar e chamar
 *     `regressLeadAction`.
 *   - `{ status: 'confirm-close-early' }` — fechar antes do horário: confirmar e
 *     re-chamar com `force: true`.
 * `force` pula a confirmação de fechar-antes-do-horário.
 */
export async function moveLeadAction(
  leadId: string,
  stageId: string,
  clientId: string,
  position?: number,
  force?: boolean
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const res = await moveLeadWithEffect(ctx, { clientId, leadId, stageId, position, force })

  if ('needsConfirm' in res) {
    if (res.needsConfirm === 'regress') {
      return ok({ status: 'confirm-regress' as const, fromKey: res.fromKey, toKey: res.toKey })
    }
    return ok({ status: 'confirm-close-early' as const, scheduledAt: res.scheduledAt })
  }
  if (!res.ok) {
    if (res.reason === 'no-appointment') {
      return ok({ status: 'needs-appointment' as const, key: res.key })
    }
    return fail(new NotFoundError('Lead'))
  }

  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ status: 'moved' as const })
}

/**
 * 2d — Retrocesso CONFIRMADO pelo usuário: desfaz os efeitos das etapas já
 * percorridas e move para a etapa destino. Ver `regressLeadStage`.
 */
export async function regressLeadAction(
  leadId: string,
  stageId: string,
  clientId: string,
  position?: number
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const res = await regressLeadStage(ctx, { clientId, leadId, stageId, position })
  if (!res.ok) return fail(new NotFoundError('Lead'))

  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId, regressed: true },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ status: 'moved' as const })
}

const scheduleSchema = z.object({
  stageId: z.string().min(1),
  procedureId: z.string().min(1, 'Procedimento obrigatório'),
  scheduledAt: z.string().min(1, 'Data obrigatória'),
  durationMinutes: z.number().int().positive(),
  notes: z.string().optional(),
  position: z.number().optional(),
})

/**
 * 2a — Move o lead p/ a etapa Agendado criando o Appointment obrigatório.
 * Exige permissão de CRM e de agenda. Converte o lead em paciente e liga o
 * appointment ao card. Ver `pipeline-stage-effects.scheduleLeadAppointment`.
 */
export async function scheduleLeadAction(leadId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')
  await assertCan(ctx, 'appointments', 'write')

  const parsed = scheduleSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt)
  if (isTooOldToSchedule(scheduledAt)) {
    return fail('Data inválida: não é possível agendar mais de 1 ano no passado')
  }

  const result = await scheduleLeadAppointment(ctx, {
    clientId,
    leadId,
    stageId: parsed.data.stageId,
    procedureId: parsed.data.procedureId,
    scheduledAt,
    durationMinutes: parsed.data.durationMinutes,
    position: parsed.data.position,
    notes: parsed.data.notes,
  })

  if (!result.ok) {
    const msg =
      result.reason === 'procedure-not-found'
        ? 'Procedimento não encontrado'
        : result.reason === 'stage-not-found'
          ? 'Etapa inválida'
          : 'Lead não encontrado'
    return fail(msg)
  }

  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId: parsed.data.stageId, appointmentId: result.appointmentId, scheduled: true },
  }).catch(() => {})
  revalidate(clientId)
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/appointments`)
  return ok({ appointmentId: result.appointmentId, patientId: result.patientId })
}

export async function reorderLeadAction(leadId: string, clientId: string, position: number) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  await reorderLead(ctx, leadId, clientId, position)
  revalidate(clientId)
  return ok(null)
}

export async function winLeadAction(leadId: string, wonStageId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const patient = await winLead(ctx, clientId, leadId, wonStageId)
  if (!patient) return fail(new NotFoundError('Lead'))
  revalidate(clientId)
  return ok(patient)
}

export async function loseLeadAction(
  leadId: string,
  lostStageId: string,
  clientId: string,
  reason: string
) {
  try {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'crm', 'write')

    await loseLead(ctx, clientId, leadId, lostStageId, reason)
    revalidate(clientId)
    return ok(null)
  } catch {
    return fail('Erro ao atualizar lead')
  }
}

export async function addInteractionAction(
  leadId: string,
  clientId: string,
  type: string,
  content: string
) {
  if (!content.trim()) return fail('Conteúdo obrigatório')
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const interaction = await addInteraction(ctx, clientId, leadId, type, content.trim())
  if (!interaction) return fail(new NotFoundError('Lead'))
  revalidate(clientId)
  return ok(interaction)
}

export async function getLeadAction(leadId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')

  const lead = await findLeadById(ctx, clientId, leadId)
  if (!lead) return fail(new NotFoundError('Lead'))
  return ok({
    ...lead,
    estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
  })
}

/**
 * Cria um card no funil EXISTING a partir de um paciente já cadastrado.
 * Diferente de `createLeadAction` (lead novo do zero), aqui o card herda os
 * dados do paciente e fica vinculado a ele via `patientId`.
 */
export async function createPatientCardAction(
  clientId: string,
  patientId: string,
  stageId: string
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  if (!patientId || !stageId) return fail('Paciente e etapa obrigatórios')

  const lead = await createLeadForPatient(ctx, clientId, patientId, stageId)
  if (!lead) return fail(new NotFoundError('Paciente'))

  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Lead',
    entityId: lead.id,
    changes: { name: lead.name, patientId },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ id: lead.id, stageId: lead.stageId, name: lead.name })
}

/** Pacientes da clínica sem card ativo no funil EXISTING (para o dialog). */
export async function listAvailablePatientsAction(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')

  const patients = await listPatientsWithoutExistingCard(ctx, clientId)
  return ok(patients)
}

export async function deleteLeadAction(leadId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'delete')

  await softDeleteLead(ctx, leadId, clientId)
  createAuditLog(ctx, { action: 'delete', entityType: 'Lead', entityId: leadId }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
