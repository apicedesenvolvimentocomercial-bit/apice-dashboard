'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import type { RevenueDetails } from '@/modules/financial/types'
import { NotFoundError, ok, fail, validationFail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { isValidCpf } from '@/lib/cpf'
import { EMAIL_REGEX, MAX_MONEY, PHONE_BR_REGEX, SAFE_TEXT_REGEX } from '@/lib/masks'
import {
  createLead,
  createLeadForPatient,
  listPatientsWithoutExistingCard,
  listStageLeads,
  rebalanceStageLeads,
  searchLeads,
  updateLead,
  reorderLead,
  reassignLead,
  findKanbanLeadById,
  findLeadById,
  softDeleteLead,
} from '@/server/repositories/lead-repository'
import { getProceduresForScheduling } from '@/server/queries/lead-queries'
import { resolveOwnerScope } from '@/server/auth/owner-scope'
import { loseLead, addInteraction } from '@/server/services/lead-service'
import {
  scheduleLeadAppointment,
  attendLeadWithPatientData,
  moveLeadWithEffect,
  moveLeadToPipeline,
  regressLeadStage,
  regressAndRescheduleLead,
} from '@/server/services/pipeline-stage-effects'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { isTooOldToSchedule, parseScheduledAt } from '@/lib/date'

// Motivo de desfecho (cancelamento/perda/mudança de funil): texto do usuário
// replicado em Appointment.cancelReason/Lead.lostReason/LeadInteraction e na
// notificação de desfecho — teto curto (motivo não é nota longa).
const reasonSchema = z.string().max(1000, 'Motivo muito grande')

// Nota de timeline do lead — mesmo teto das demais notas/descrições do app.
const interactionContentSchema = z.string().max(65535, 'Nota muito grande')

const leadSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome obrigatório')
    .max(255, 'Nome muito grande')
    .regex(SAFE_TEXT_REGEX, 'O nome contém caracteres inválidos'),
  // Formato canônico = o que a máscara do frontend produz: `(11) 91234-1234`.
  // Campo é opcional; string vazia é aceita como "não informado".
  phone: z
    .string()
    .regex(PHONE_BR_REGEX, 'Telefone inválido. Use o formato (11) 91234-1234')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .max(255, 'Email de tamanho inválido')
    .regex(EMAIL_REGEX, 'E-mail incompleto')
    .email('E-mail inválido')
    .optional()
    .or(z.literal('')),
  source: z.enum(['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL', 'WHATSAPP', 'WALK_IN', 'OTHER']),
  stageId: z.string().min(1).max(64),
  procedureInterest: z
    .string()
    .max(65535, 'Muitos procedimentos de interesse')
    .regex(SAFE_TEXT_REGEX, 'Os procedimentos de interesse contém caracteres inválidos')
    .optional(),
  procedureInterestIds: z.array(z.string().max(64)).max(100, 'Muitos procedimentos').optional(),
  estimatedValue: z.number().max(MAX_MONEY, 'Valor estimado muito alto').positive().optional(),
  notes: z
    .string()
    .max(65535, 'Nota muito grande')
    .regex(SAFE_TEXT_REGEX, 'a nota contém caracteres inválidos')
    .optional(),
})

/**
 * CRIAÇÃO exige ao menos UM meio de contato (telefone OU e-mail): um lead sem
 * contato nenhum nasce inalcançável e trava o funil.
 *
 * O `refine` vive aqui, e não no `leadSchema`, porque `updateLeadAction` usa
 * `leadSchema.partial()` — e `.partial()` não existe em `ZodEffects`.
 */
const createLeadSchema = leadSchema.refine((d) => Boolean(d.phone?.trim() || d.email?.trim()), {
  message: 'Informe telefone ou e-mail',
  path: ['phone'],
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

  const parsed = createLeadSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const lead = await createLead(ctx, clientId, {
    ...parsed.data,
    phone: parsed.data.phone || undefined,
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
  if (!parsed.success) return validationFail(parsed.error)

  await updateLead(ctx, leadId, clientId, {
    ...parsed.data,
    phone: parsed.data.phone || undefined,
    email: parsed.data.email || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

/**
 * Próxima página de cards de uma coluna do kanban (M1 do plano de correções —
 * botão "carregar mais"). Mesma ordem estável (position,id) e MESMO escopo de
 * dono do SSR: retenção é base compartilhada (sem filtro), demais funis filtram
 * por `resolveOwnerScope` (quem não tem crm:viewAll só vê os próprios cards).
 */
export async function loadStageLeadsAction(clientId: string, stageId: string, cursor?: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')

  // Belt: a etapa precisa ser desta clínica; o kind decide o escopo de dono.
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, clientId },
    select: { pipeline: { select: { kind: true } } },
  })
  if (!stage) return fail('Etapa não encontrada')

  const ownerId = stage.pipeline.kind === 'RETENTION' ? null : await resolveOwnerScope(ctx, 'crm')
  const page = await listStageLeads(ctx, clientId, stageId, {
    cursor,
    ownerId,
  })
  return ok(page)
}

/**
 * Renumera a coluna quando a bissecção de posição esgota a precisão do Float
 * (Fase 4): o board detecta via `isPositionExhausted` e chama isto em vez de
 * persistir uma posição degenerada (que deixaria a ordem indeterminada).
 */
export async function rebalanceLeadAction(
  leadId: string,
  clientId: string,
  stageId: string,
  beforeLeadId: string | null
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const count = await rebalanceStageLeads(ctx, clientId, stageId, leadId, beforeLeadId)
  if (count === 0) return fail('Lead não encontrado nesta etapa')
  revalidate(clientId)
  return ok({ rebalanced: count })
}

/**
 * Busca global de cards (M1) — server-side porque o board agora é paginado e a
 * busca em memória só enxergaria a 1ª página de cada coluna.
 */
export async function searchLeadsAction(clientId: string, term: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')
  const ownerId = await resolveOwnerScope(ctx, 'crm')
  const rows = await searchLeads(ctx, clientId, term, ownerId)
  return ok(
    rows.map(({ stage, ...lead }) => ({
      lead,
      pipelineId: stage.pipeline.id,
      pipelineName: stage.pipeline.name,
      stageName: stage.name,
    }))
  )
}

/**
 * Dados do dialog GLOBAL "Novo lead" do topbar (chrome): resolve a etapa Lead
 * do funil COMERCIAL da clínica (mesma resolução do lead-ingest) + os
 * procedimentos p/ "procedimentos de interesse". Gate em `crm:write` — o dialog
 * só serve p/ criar.
 */
export async function getNewLeadDialogDataAction(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const leadStage = await prisma.pipelineStage.findFirst({
    where: { clientId, nativeKey: 'LEAD', pipeline: { kind: 'COMMERCIAL' } },
    select: { id: true, pipelineId: true },
  })
  if (!leadStage) return fail('Funil comercial não encontrado. Configure-o na aba Funil.')

  const procedures = await getProceduresForScheduling(clientId)
  return ok({ stageId: leadStage.id, pipelineId: leadStage.pipelineId, procedures })
}

/**
 * Um card no shape do kanban p/ o destaque via URL (`/crm?highlight=<id>` — o
 * redirect pós-criação do "Novo lead" global). O funil devolve junto p/ a aba
 * certa ser ativada; o board injeta o card se ele estiver além da 1ª página
 * (mesmo fluxo do ensureLead da busca global).
 */
export async function getKanbanLeadAction(clientId: string, leadId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')

  const ownerId = await resolveOwnerScope(ctx, 'crm')
  const row = await findKanbanLeadById(ctx, clientId, leadId, ownerId)
  if (!row) return fail(new NotFoundError('Lead'))

  const { stage, ...lead } = row
  return ok({ lead, pipelineId: stage.pipeline.id })
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
  const parsedReason = reasonSchema.optional().safeParse(cancelReason)
  if (!parsedReason.success) return validationFail(parsedReason.error)

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
  stageId: z.string().min(1).max(64),
  procedureIds: z
    .array(z.string().min(1).max(64))
    .min(1, 'Selecione ao menos um procedimento')
    .max(100, 'Muitos procedimentos'),
  scheduledAt: z.string().min(1, 'Data obrigatória').max(30, 'Data inválida'),
  durationMinutes: z
    .number()
    .max(360, 'Duração de procedimento muito grande muito grande')
    .int()
    .positive(),
  notes: z
    .string()
    .max(65535, 'Nota muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A nota contém caracteres inválidos'
    )
    .optional(),
  position: z.number().optional(),
})

const rescheduleSchema = z.object({
  stageId: z.string().min(1).max(64),
  appointmentId: z.string().min(1).max(64),
  procedureId: z.string().min(1, 'Procedimento obrigatório').max(64),
  scheduledAt: z.string().min(1, 'Data obrigatória').max(30, 'Data inválida'),
  durationMinutes: z
    .number()
    .max(360, 'Duração de procedimento muito grande muito grande')
    .int()
    .positive(),
  notes: z
    .string()
    .max(65535, 'Nota muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A nota contém caracteres inválidos'
    )
    .optional(),
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
  if (!parsed.success) return validationFail(parsed.error)

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
  if (!parsed.success) return validationFail(parsed.error)

  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt)
  if (isTooOldToSchedule(scheduledAt)) {
    return fail('Data inválida: não é possível agendar mais de 1 ano no passado')
  }

  const result = await scheduleLeadAppointment(ctx, {
    clientId,
    leadId,
    stageId: parsed.data.stageId,
    procedureIds: parsed.data.procedureIds,
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
  stageId: z.string().min(1).max(64),
  position: z.number().optional(),
  name: z
    .string()
    .min(2, 'Nome obrigatório')
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    ),
  phone: z
    .string()
    .min(1, 'Telefone obrigatório')
    .length(12, 'Telefone inválido')
    .regex(/^[1-9]{2}\s?9\d{8}$/, 'Telefone inválido'),
  email: z
    .string()
    .max(255, 'Email de tamanho inválido')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email com formato inválido')
    .email('E-mail inválido'),
  birthDate: z.string().min(1, 'Data de nascimento obrigatória').max(30, 'Data inválida'),
  cpf: z
    .string()
    .min(1, 'CPF obrigatório')
    .max(20, 'CPF inválido')
    .refine(isValidCpf, 'CPF inválido'),
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
  if (!parsed.success) return validationFail(parsed.error)

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

const movePipelineSchema = z.object({
  targetPipelineId: z.string().min(1, 'Funil destino obrigatório').max(64),
  // Dados do paciente (obrigatórios só na conversão LEAD→PATIENT; validados aqui).
  patient: z
    .object({
      name: z
        .string()
        .min(2, 'Nome obrigatório')
        .max(255, 'Nome muito grande')
        .regex(
          /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
          'O nome contém caracteres inválidos'
        ),
      phone: z
        .string()
        .min(1, 'Telefone obrigatório')
        .length(12, 'Telefone inválido')
        .regex(/^[1-9]{2}\s?9\d{8}$/, 'Telefone inválido'),
      email: z
        .string()
        .email('E-mail inválido')
        .max(255, 'Email de tamanho inválido')
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email com formato inválido'),
      birthDate: z.string().min(1, 'Data de nascimento obrigatória').max(30, 'Data inválida'),
      cpf: z
        .string()
        .min(1, 'CPF obrigatório')
        .max(20, 'CPF inválido')
        .refine(isValidCpf, 'cpf inválido'),
    })
    .optional(),
  reason: reasonSchema.optional(),
})

/**
 * Move um card para OUTRO funil (não entre etapas — isso é `moveLeadAction`). O
 * fluxo depende da categoria do funil destino (ver `moveLeadToPipeline`):
 * LEAD→PATIENT exige os 5 campos do paciente + motivo (vira paciente real; o motivo
 * vai no audit log do admin); demais só relocam. Exige `crm:write` (+ `patients:write`
 * quando há conversão de paciente).
 */
export async function moveLeadToPipelineAction(
  leadId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const parsed = movePipelineSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  // Conversão em paciente (dados presentes) também exige permissão de pacientes.
  if (parsed.data.patient) await assertCan(ctx, 'patients', 'write')

  const result = await moveLeadToPipeline(ctx, {
    clientId,
    leadId,
    targetPipelineId: parsed.data.targetPipelineId,
    patient: parsed.data.patient
      ? { ...parsed.data.patient, birthDate: new Date(parsed.data.patient.birthDate) }
      : undefined,
    reason: parsed.data.reason?.trim() || undefined,
  })

  if (!result.ok) {
    const msg =
      result.reason === 'same-pipeline'
        ? 'O card já está neste funil'
        : result.reason === 'no-stage'
          ? 'O funil destino não tem etapas. Configure-o antes.'
          : result.reason === 'needs-patient-data'
            ? 'Preencha os dados do paciente para mover para um funil de paciente'
            : result.reason === 'pipeline-not-found'
              ? 'Funil destino inválido'
              : 'Lead não encontrado'
    return fail(msg)
  }

  // Motivo no audit log do admin (requisito): vai em `changes`.
  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: {
      movedToPipelineId: parsed.data.targetPipelineId,
      converted: result.converted,
      ...(parsed.data.reason?.trim() ? { reason: parsed.data.reason.trim() } : {}),
    },
  }).catch(() => {})
  revalidate(clientId)
  revalidatePath('/patients')
  revalidatePath(`/clients/${clientId}/patients`)
  return ok({ status: 'moved' as const, converted: result.converted })
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

// winLeadAction REMOVIDO (2026-06-10): o atalho "Ganhou" do drawer foi extinto
// por decisão (burlava o fluxo Compareceu→Fechado — ver CLAUDE.md, invariantes
// de pipeline); a action ficou órfã. Fechar card = moveLeadWithEffect.

export async function loseLeadAction(
  leadId: string,
  lostStageId: string,
  clientId: string,
  reason: string
) {
  const parsedReason = reasonSchema.safeParse(reason)
  if (!parsedReason.success) return validationFail(parsedReason.error)
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
  const parsedContent = interactionContentSchema.safeParse(content)
  if (!parsedContent.success) return validationFail(parsedContent.error)
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
