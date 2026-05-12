'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { NotFoundError, ok, fail } from '@/types/errors'
import { getTenantContext } from '@/server/tenant/context'
import {
  createLead,
  updateLead,
  moveLead,
  findLeadById,
  softDeleteLead,
} from '@/server/repositories/lead-repository'
import { winLead, loseLead, addInteraction } from '@/server/services/lead-service'

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
  const parsed = leadSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const lead = await createLead(ctx, clientId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  })
  revalidate(clientId)
  return ok({ id: lead.id, stageId: lead.stageId, name: lead.name })
}

export async function updateLeadAction(leadId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
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
  await moveLead(ctx, leadId, stageId)
  revalidate(clientId)
  return ok(null)
}

export async function winLeadAction(leadId: string, wonStageId: string, clientId: string) {
  const ctx = await getTenantContext()
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
  const interaction = await addInteraction(ctx, leadId, type, content.trim())
  revalidate(clientId)
  return ok(interaction)
}

export async function getLeadAction(leadId: string) {
  const ctx = await getTenantContext()
  const lead = await findLeadById(ctx, leadId)
  if (!lead) return fail(new NotFoundError('Lead'))
  return ok({
    ...lead,
    estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
  })
}

export async function deleteLeadAction(leadId: string, clientId: string) {
  const ctx = await getTenantContext()
  await softDeleteLead(ctx, leadId)
  revalidate(clientId)
  return ok(null)
}
