import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { ingestLead } from '@/server/services/lead-ingest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PROVIDERS = new Set(['whatsapp', 'meta-ads', 'google-ads'])

/**
 * Fail-closed (SEC-003·B): o webhook só aceita POST se `WEBHOOK_SECRET` estiver
 * configurado E o header `x-webhook-secret` bater (compare constante). Sem segredo
 * configurado → endpoint desabilitado (401). Quando o adapter real de cada provider
 * for plugado, trocar por validação de assinatura por provider (Meta `X-Hub-Signature-256`,
 * WhatsApp, Google) ANTES de processar.
 */
function isWebhookAuthorized(req: Request): boolean {
  const secret = env.WEBHOOK_SECRET
  if (!secret) return false
  const provided = req.headers.get('x-webhook-secret')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Recebe callbacks dos providers externos e ingere o contato como Lead na etapa
 * LEAD da pipeline COMMERCIAL da clínica (Fase 2f). Contrato do payload (JSON):
 *   { clientId: string, name: string, phone?, email?, procedureInterest? }
 * O provider da URL define o `LeadSource` (meta-ads/google-ads/whatsapp).
 *
 * RLS: `ingestLead` chama `enterClientScope(clientId)` antes de tocar dados de
 * clínica — esta rota não passa por `getClinicContext` (rls-gambiarra §entrypoints).
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  if (!isWebhookAuthorized(req)) {
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
    clientId: body.clientId,
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
