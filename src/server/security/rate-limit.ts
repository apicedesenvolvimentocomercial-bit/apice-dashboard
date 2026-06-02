import { prisma } from '@/lib/prisma'

/**
 * Rate-limiting de janela fixa em Postgres (model `RateLimit`) — defesa contra
 * brute-force de login e flooding de webhook (SEC-002, ledger seguranca-pendencias.md).
 * Sem infra externa: um contador por `key`. Não é exato sob concorrência alta (read
 * then write), mas rate-limiting tolera folga — o objetivo é barrar abuso, não contar
 * ao milissegundo. Tabela global (sem clientId) → fora da RLS.
 */

export type RateLimitConfig = {
  /** Máximo de hits permitidos dentro da janela. */
  limit: number
  /** Duração da janela, em ms. */
  windowMs: number
  /** Quanto tempo bloquear após estourar o teto, em ms. */
  blockMs: number
}

export type RateLimitState = { blocked: boolean; retryAfterSec: number }

// Login: 8 falhas por 15 min → trava 15 min. Webhook: 60 req/min por IP → trava 5 min.
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  limit: 8,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
}
export const WEBHOOK_RATE_LIMIT: RateLimitConfig = {
  limit: 60,
  windowMs: 60 * 1000,
  blockMs: 5 * 60 * 1000,
}

function secsUntil(when: Date, now: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - now.getTime()) / 1000))
}

/** Peek read-only: a chave está bloqueada agora? Não conta hit. */
export async function isRateLimited(key: string): Promise<RateLimitState> {
  const now = new Date()
  const row = await prisma.rateLimit.findUnique({
    where: { key },
    select: { blockedUntil: true },
  })
  if (row?.blockedUntil && row.blockedUntil > now) {
    return { blocked: true, retryAfterSec: secsUntil(row.blockedUntil, now) }
  }
  return { blocked: false, retryAfterSec: 0 }
}

/**
 * Conta um hit para `key`. Reinicia a janela se expirou; bloqueia se o teto foi
 * estourado. Se já está bloqueado, mantém o bloqueio sem reabrir a janela.
 */
export async function registerHit(key: string, cfg: RateLimitConfig): Promise<RateLimitState> {
  const now = new Date()
  const row = await prisma.rateLimit.findUnique({ where: { key } })

  if (row?.blockedUntil && row.blockedUntil > now) {
    return { blocked: true, retryAfterSec: secsUntil(row.blockedUntil, now) }
  }

  // Janela inexistente ou expirada → reinicia em 1.
  if (!row || now.getTime() - row.windowStart.getTime() > cfg.windowMs) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now, blockedUntil: null },
      update: { count: 1, windowStart: now, blockedUntil: null },
    })
    return { blocked: false, retryAfterSec: 0 }
  }

  const count = row.count + 1
  if (count > cfg.limit) {
    const blockedUntil = new Date(now.getTime() + cfg.blockMs)
    await prisma.rateLimit.update({ where: { key }, data: { count, blockedUntil } })
    return { blocked: true, retryAfterSec: secsUntil(blockedUntil, now) }
  }
  await prisma.rateLimit.update({ where: { key }, data: { count } })
  return { blocked: false, retryAfterSec: 0 }
}

/** Zera os contadores das chaves (ex.: login bem-sucedido limpa email+IP). */
export async function clearRateLimit(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } })
}

/** Extrai o IP do cliente dos headers de proxy (best-effort). */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
