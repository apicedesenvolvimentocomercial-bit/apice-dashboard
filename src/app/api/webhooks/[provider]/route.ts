import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

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
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return false
  const provided = req.headers.get('x-webhook-secret')
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Endpoint genérico para receber callbacks dos providers externos. No MVP
 * apenas registra o payload — a fábrica `getXProvider()` em `src/server/integrations`
 * retorna mocks, então não há nada real para processar ainda. Quando o
 * adapter de produção for plugado, este handler delega ao provider concreto.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }

  if (!isWebhookAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // Alguns providers enviam form-urlencoded — capturamos o cru.
    body = await req.text().catch(() => null)
  }

  logger.info('Webhook received', {
    provider,
    hasBody: body != null,
    contentType: req.headers.get('content-type') ?? null,
  })

  return NextResponse.json({ ok: true, provider, received: true })
}

export async function GET(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, provider, status: 'mock' })
}
