import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getRequestIp } from '@/lib/request-ip'
import { hashWebhookToken } from '@/lib/webhook-token'
import { consumeRateLimit } from '@/server/security/rate-limit'
import { ingestLead } from '@/server/services/lead-ingest'
import { verifyProviderSignature } from '@/server/services/webhook-signature'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PROVIDERS = new Set(['whatsapp', 'meta-ads', 'google-ads'])

// Rate-limit (seguranca-pendencias #1): teto de flood do webhook.
const IP_LIMIT = { limit: 60, windowSec: 60 } // por origem
const CLIENT_LIMIT = { limit: 120, windowSec: 60 } // por clínica

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { ok: false, error: 'rate-limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  )
}

/**
 * Resolve a clínica a partir do TOKEN por-clínica (seguranca-pendencias #2): o
 * token cru chega no header `x-webhook-secret`, hasheamos (sha256) e procuramos a
 * clínica pelo índice único `webhookTokenHash`. Assim o `clientId` NÃO vem mais do
 * body — quem tem o token de uma clínica só escreve naquela clínica.
 *
 * `Client` não está sob RLS (não é tabela operacional com filtro de tenant), então
 * o lookup sem escopo funciona; o `ingestLead` fixa `enterClientScope(clientId)`
 * antes de tocar qualquer dado de clínica.
 */
async function resolveClientIdByToken(token: string): Promise<string | null> {
  const hash = hashWebhookToken(token)
  const client = await prisma.client.findFirst({
    where: { webhookTokenHash: hash, deletedAt: null },
    select: { id: true },
  })
  return client?.id ?? null
}

/**
 * Recebe callbacks dos providers externos e ingere o contato como Lead na etapa
 * LEAD da pipeline COMMERCIAL da clínica (Fase 2f). Contrato do payload (JSON):
 *   { name: string, phone?, email?, procedureInterest? }
 * A CLÍNICA vem do token (header `x-webhook-secret`), não do body. O provider da
 * URL define o `LeadSource` (meta-ads/google-ads/whatsapp).
 *
 * Camadas de segurança (seguranca-pendencias #1/#2):
 *   1. flood-guard por IP;
 *   2. `verifyProviderSignature` (hoje stub; HMAC quando o adapter real entrar);
 *   3. token por-clínica resolve o `clientId` server-side;
 *   4. flood-guard por clínica.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  // 1) Flood-guard por IP — antes de qualquer trabalho.
  const ip = getRequestIp(req)
  const ipLimit = await consumeRateLimit(`webhook:ip:${ip}`, IP_LIMIT)
  if (!ipLimit.allowed) return tooMany(ipLimit.retryAfterSec)

  const rawBody = await req.text()

  // 2) Assinatura por-provider (hoje stub; valida HMAC quando o adapter real for plugado).
  if (!verifyProviderSignature(provider, req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 3) Token por-clínica resolve o clientId (body não decide mais a clínica).
  const token = req.headers.get('x-webhook-secret')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const clientId = await resolveClientIdByToken(token)
  if (!clientId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 4) Flood-guard por clínica.
  const clientLimit = await consumeRateLimit(`webhook:client:${clientId}`, CLIENT_LIMIT)
  if (!clientLimit.allowed) return tooMany(clientLimit.retryAfterSec)

  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(rawBody || '{}')
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await ingestLead(provider, clientId, {
    name: body.name,
    phone: body.phone,
    email: body.email,
    procedureInterest: body.procedureInterest,
  })

  if (!result.ok) {
    const status =
      result.reason === 'client-not-found' || result.reason === 'no-lead-stage' ? 404 : 400
    logger.warn('Webhook lead ingest rejected', { provider, reason: result.reason })
    return NextResponse.json({ ok: false, error: result.reason }, { status })
  }

  logger.info('Webhook lead ingested', { provider, leadId: result.leadId })
  return NextResponse.json({ ok: true, provider, leadId: result.leadId })
}
