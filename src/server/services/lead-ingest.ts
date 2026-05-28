import type { LeadSource } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { enterClientScope } from '@/server/tenant/client-scope'

/**
 * Ingestão de Lead via webhook (Fase 2f). Cria um card na etapa LEAD (nativeKey)
 * da pipeline COMMERCIAL da clínica, a partir de um contato externo (landing de
 * anúncio ou WhatsApp). Cada provider mapeia para um `LeadSource` distinto.
 *
 * SEGURANÇA: o webhook NÃO passa por `getClinicContext`, então a GUC de RLS fica
 * nula (= contexto admin, libera toda a org). Fixamos `enterClientScope(clientId)`
 * ANTES de qualquer query de clínica para a RLS valer (rls-gambiarra §entrypoints).
 */

const PROVIDER_SOURCE: Record<string, LeadSource> = {
  'meta-ads': 'META_ADS',
  'google-ads': 'GOOGLE_ADS',
  whatsapp: 'WHATSAPP',
}

export type IngestResult =
  | { ok: true; leadId: string }
  | { ok: false; reason: 'unknown-provider' | 'client-not-found' | 'no-lead-stage' | 'invalid' }

export async function ingestLead(
  provider: string,
  payload: {
    clientId?: unknown
    name?: unknown
    phone?: unknown
    email?: unknown
    procedureInterest?: unknown
  }
): Promise<IngestResult> {
  const source = PROVIDER_SOURCE[provider]
  if (!source) return { ok: false, reason: 'unknown-provider' }

  const clientId = typeof payload.clientId === 'string' ? payload.clientId : null
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!clientId || !name) return { ok: false, reason: 'invalid' }

  // Fixa o escopo de RLS para esta clínica antes de tocar dados de clínica.
  enterClientScope(clientId)

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, organizationId: true },
  })
  if (!client) return { ok: false, reason: 'client-not-found' }

  // Etapa LEAD da pipeline COMMERCIAL da clínica.
  const leadStage = await prisma.pipelineStage.findFirst({
    where: { clientId, nativeKey: 'LEAD', pipeline: { kind: 'COMMERCIAL' } },
    select: { id: true },
  })
  if (!leadStage) return { ok: false, reason: 'no-lead-stage' }

  const lead = await prisma.lead.create({
    data: {
      organizationId: client.organizationId,
      clientId,
      name,
      phone: typeof payload.phone === 'string' ? payload.phone : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      source,
      procedureInterest:
        typeof payload.procedureInterest === 'string' ? payload.procedureInterest : null,
      stageId: leadStage.id,
      firstContactAt: new Date(),
    },
    select: { id: true },
  })

  return { ok: true, leadId: lead.id }
}
