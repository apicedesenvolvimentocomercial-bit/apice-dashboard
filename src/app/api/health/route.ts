import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Health-check (decisão 1.3 do plano de correções). Público de propósito —
 * uptime monitors não autenticam. Não expõe nada além de "app de pé + banco
 * respondendo"; nunca inclua versões, envs ou contagens aqui.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'ok' })
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 })
  }
}
