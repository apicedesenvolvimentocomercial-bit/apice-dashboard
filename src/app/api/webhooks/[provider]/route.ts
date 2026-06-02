import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { clientIpFromHeaders, registerHit, WEBHOOK_RATE_LIMIT } from '@/server/security/rate-limit'
import { ingestLead } from '@/server/services/lead-ingest'
import { resolveClientIdByWebhookToken } from '@/server/services/webhook-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PROVIDERS = new Set(['whatsapp', 'meta-ads', 'google-ads'])

/**
 * Recebe callbacks dos providers externos e ingere o contato como Lead na etapa
 * LEAD da pipeline COMMERCIAL da clínica (Fase 2f). Contrato do payload (JSON):
 *   { name: string, phone?, email?, procedureInterest? }
 * O provider da URL define o `LeadSource` (meta-ads/google-ads/whatsapp).
 *
 * SEGURANÇA (SEC-002/SEC-003, ledger seguranca-pendencias.md):
 * - **Token por-clínica** (header `x-webhook-token`) resolve o `clientId` server-side.
 *   O body NÃO escolhe mais a clínica → sem segredo válido, 401 (fail-closed).
 * - **Rate-limit por IP** (anti-flooding) antes do trabalho de DB.
 * Quando o adapter real de cada provider for plugado, somar validação de assinatura
 * por provider (Meta `X-Hub-Signature-256`, WhatsApp, Google) ANTES de processar.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  // Rate-limit por IP antes de qualquer lookup pesado (protege até o request não autenticado).
  const ip = clientIpFromHeaders(req.headers)
  const rl = await registerHit(`webhook:ip:${ip}`, WEBHOOK_RATE_LIMIT)
  if (rl.blocked) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  // Token por-clínica resolve o clientId. Sem token válido → 401.
  const token = req.headers.get('x-webhook-token') ?? ''
  const clientId = await resolveClientIdByWebhookToken(token)
  if (!clientId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await ingestLead(provider, {
    // clientId vem do token (server-side); body.clientId é ignorado de propósito.
    clientId,
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

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, provider, status: 'mock' })
}
