import type { LeadSource } from '@prisma/client'
import { z } from 'zod'

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
  | { ok: true; leadId: string; deduped?: true }
  | { ok: false; reason: 'unknown-provider' | 'client-not-found' | 'no-lead-stage' | 'invalid' }

/** Janela de dedupe do webhook (decisão N do plano de correções). */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

// Campo opcional de texto: mantém a leniência antiga (não-string ⇒ ausente, igual
// ao `typeof === 'string'` de antes) mas adiciona teto de tamanho. Endurece contra
// payloads gigantes sem rejeitar lead legítimo nem exigir formato (ex.: e-mail).
const optText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : undefined),
    z.string().max(max).optional()
  )

const ingestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: optText(40),
  email: optText(200),
  procedureInterest: optText(500),
})

export async function ingestLead(
  provider: string,
  // `clientId` é RESOLVIDO server-side pelo token por-clínica no webhook
  // (seguranca-pendencias #2) — NÃO vem mais do body. O body só traz os dados do
  // contato.
  clientId: string,
  payload: {
    name?: unknown
    phone?: unknown
    email?: unknown
    procedureInterest?: unknown
  }
): Promise<IngestResult> {
  const source = PROVIDER_SOURCE[provider]
  if (!source) return { ok: false, reason: 'unknown-provider' }

  const parsed = ingestSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const { name, phone, email, procedureInterest } = parsed.data

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

  // Dedupe (decisão N): retry do provedor / double-submit reposta o MESMO contato.
  // Telefone ou e-mail igual nas últimas 24h → devolve o lead existente (idempotente)
  // em vez de duplicar o card no funil. Sem phone/email não há chave segura (nome
  // colide demais) → segue criando.
  if (phone || email) {
    const matchers: object[] = []
    if (phone) matchers.push({ phone })
    if (email) matchers.push({ email: { equals: email, mode: 'insensitive' as const } })
    const existing = await prisma.lead.findFirst({
      where: {
        clientId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        OR: matchers,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (existing) return { ok: true, leadId: existing.id, deduped: true }
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: client.organizationId,
      clientId,
      name,
      phone: phone ?? null,
      email: email ?? null,
      source,
      procedureInterest: procedureInterest ?? null,
      stageId: leadStage.id,
      firstContactAt: new Date(),
    },
    select: { id: true },
  })

  return { ok: true, leadId: lead.id }
}
