'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { NotFoundError, ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createLead,
  updateLead,
  moveLead,
  findLeadById,
  softDeleteLead,
} from '@/server/repositories/lead-repository'
import { winLead, loseLead, addInteraction } from '@/server/services/lead-service'
import { createAuditLog } from '@/server/repositories/audit-repository'

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
  revalidatePath(`/clients/${clientId}/crm`)
}

export async function createLeadAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
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
  await assertCan(ctx, 'crm', 'write')

  const parsed = leadSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateLead(ctx, leadId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  })
  revalidate(clientId)
  return ok(null)
}

export async function moveLeadAction(leadId: string, stageId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'write')

  await moveLead(ctx, leadId, stageId)
  createAuditLog(ctx, {
    action: 'stage_change',
    entityType: 'Lead',
    entityId: leadId,
    changes: { stageId },
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}

export async function winLeadAction(leadId: string, wonStageId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'write')

  const patient = await winLead(ctx, leadId, wonStageId)
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
    await assertCan(ctx, 'crm', 'write')

    await loseLead(ctx, leadId, lostStageId, reason)
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
  await assertCan(ctx, 'crm', 'write')

  const interaction = await addInteraction(ctx, leadId, type, content.trim())
  revalidate(clientId)
  return ok(interaction)
}

export async function getLeadAction(leadId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'crm', 'read')

  const lead = await findLeadById(ctx, leadId)
  if (!lead) return fail(new NotFoundError('Lead'))
  return ok({
    ...lead,
    estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
  })
}

export async function deleteLeadAction(leadId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'delete')

  await softDeleteLead(ctx, leadId)
  createAuditLog(ctx, { action: 'delete', entityType: 'Lead', entityId: leadId }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
