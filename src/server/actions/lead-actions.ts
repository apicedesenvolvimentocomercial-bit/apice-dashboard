'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import type { RevenueDetails } from '@/modules/financial/types'
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
  reassignLead,
  findLeadById,
  softDeleteLead,
} from '@/server/repositories/lead-repository'
import { winLead, loseLead, addInteraction } from '@/server/services/lead-service'
import {
  scheduleLeadAppointment,
  attendLeadWithPatientData,
  moveLeadWithEffect,
  regressLeadStage,
  regressAndRescheduleLead,
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
  procedureInterestIds: z.array(z.string()).optional(),
  estimatedValue: z.number().positive().optional(),
  notes: z.string().optional(),
})

function revalidate(clientId: string) {
  revalidatePath('/crm')
  revalidatePath('/crm/clientes')
  revalidatePath(`/clients/${clientId}/crm`)
  revalidatePath(`/clients/${clientId}/crm/clientes`)
}

/**
 * Item 4: reatribui o dono de um lead a outro usuário da clínica. Exige
 * crm:assignToOthers (titular sempre, via can()). O novo dono precisa ser membro
 * ativo da MESMA clínica.
 */
export async function reassignLeadAction(leadId: string, clientId: string, assignedToId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'assignToOthers')

  const member = await prisma.user.findFirst({
    where: { id: assignedToId, clientId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  if (!member) return fail('Usuário inválido para esta clínica')

  const res = await reassignLead(ctx, leadId, clientId, assignedToId)
  if (res.count === 0) return fail('Lead não encontrado')

  revalidate(clientId)
  return ok(null)
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
 *   - `{ status: 'needs-attendance' }` — tentou Fechar sem passar por Compareceu.
 *   - `{ status: 'confirm-regress' }` — retrocesso: cliente deve confirmar e chamar
 *     `regressLeadAction`.
 * `cancelReason` (obrigatório ao mover p/ Cancelado) é repassado ao efeito (feat5).
 */
export async function moveLeadAction(
  leadId: string,
  stageId: string,
  clientId: string,
  position?: number,
  cancelReason?: string,
  // Detalhes da baixa ao mover p/ Fechado (forma/parcelas/desconto/data). Validado
  // leve; repassado ao efeito CLOSED. Ausente = baixa simples (compat).
  revenueDetails?: RevenueDetails
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const res = await moveLeadWithEffect(ctx, {
    clientId,
    leadId,
    stageId,
    position,
    cancelReason,
    revenueDetails,
  })

  if ('needsConfirm' in res) {
    return ok({ status: 'confirm-regress' as const, fromKey: res.fromKey, toKey: res.toKey })
  }
  if (!res.ok) {
    if (res.reason === 'no-appointment') {
      return ok({ status: 'needs-appointment' as const, key: res.key })
    }
    if (res.reason === 'not-attended') {
      return ok({ status: 'needs-attendance' as const })
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

const rescheduleSchema = z.object({
  stageId: z.string().min(1),
  appointmentId: z.string().min(1),
  procedureId: z.string().min(1, 'Procedimento obrigatório'),
  scheduledAt: z.string().min(1, 'Data obrigatória'),
  durationMinutes: z.number().int().positive(),
  notes: z.string().optional(),
  position: z.number().optional(),
})

/**
 * Retrocesso para Agendado COM remarcação: o operador confirma e (opcionalmente)
 * ajusta a data; o MESMO agendamento é atualizado e volta a SCHEDULED (não cria
 * outro). Ver `regressAndRescheduleLead`.
 */
export async function regressRescheduleLeadAction(
  leadId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')
  await assertCan(ctx, 'appointments', 'write')

  const parsed = rescheduleSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt)
  if (isTooOldToSchedule(scheduledAt)) {
    return fail('Data inválida: não é possível agendar mais de 1 ano no passado')
  }

  const result = await regressAndRescheduleLead(ctx, {
    clientId,
    leadId,
    stageId: parsed.data.stageId,
    appointmentId: parsed.data.appointmentId,
    procedureId: parsed.data.procedureId,
    scheduledAt,
    durationMinutes: parsed.data.durationMinutes,
    notes: parsed.data.notes,
    position: parsed.data.position,
  })

  if (!result.ok) {
    const msg =
      result.reason === 'procedure-not-found'
        ? 'Procedimento não encontrado'
        : result.reason === 'stage-not-found'
          ? 'Etapa inválida'
          : result.reason === 'no-appointment'
            ? 'Agendamento do card não encontrado'
            : 'Lead não encontrado'
    return fail(msg)
  }

  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId: parsed.data.stageId, rescheduled: true },
  }).catch(() => {})
  revalidate(clientId)
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/appointments`)
  return ok({ status: 'moved' as const })
}

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

const attendSchema = z.object({
  stageId: z.string().min(1),
  position: z.number().optional(),
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().min(1, 'Telefone obrigatório'),
  email: z.string().email('E-mail inválido'),
  birthDate: z.string().min(1, 'Data de nascimento obrigatória'),
  cpf: z.string().min(1, 'CPF obrigatório'),
})

/**
 * feat1 — Move o lead p/ Compareceu COMPLETANDO o cadastro do paciente (os 5
 * campos obrigatórios). Sem agendamento prévio (passar por Agendado) bloqueia.
 * Ver `pipeline-stage-effects.attendLeadWithPatientData`.
 */
export async function attendLeadAction(leadId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')
  await assertCan(ctx, 'patients', 'write')

  const parsed = attendSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const result = await attendLeadWithPatientData(ctx, {
    clientId,
    leadId,
    stageId: parsed.data.stageId,
    position: parsed.data.position,
    patient: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      birthDate: new Date(parsed.data.birthDate),
      cpf: parsed.data.cpf,
    },
  })

  if (!result.ok) {
    const msg =
      result.reason === 'no-appointment'
        ? 'Agende o cliente (mova para Agendado) antes de marcar Compareceu.'
        : result.reason === 'stage-not-found'
          ? 'Etapa inválida'
          : 'Lead não encontrado'
    return fail(msg)
  }

  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId: parsed.data.stageId, attended: true },
  }).catch(() => {})
  revalidate(clientId)
  revalidatePath('/appointments')
  revalidatePath(`/clients/${clientId}/appointments`)
  revalidatePath('/patients')
  revalidatePath(`/clients/${clientId}/patients`)
  return ok({ status: 'moved' as const })
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
