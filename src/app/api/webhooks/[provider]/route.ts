import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PROVIDERS = new Set(['whatsapp', 'meta-ads', 'google-ads'])

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
