import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * Rate-limiting fixed-window persistido no Postgres (seguranca-pendencias #1).
 * Sem infra externa (Redis/Upstash) — usa a tabela `RateLimit` (sem clientId,
 * fora da RLS). Usado no login (`authorize`) e no webhook de ingestão de leads.
 *
 * `consumeRateLimit` é ATÔMICO (um único `INSERT ... ON CONFLICT`), então conta
 * certo mesmo sob rajada concorrente — importante p/ não vazar tentativas de
 * brute-force. A janela reseta sozinha quando `expiresAt` passa.
 */

export type RateLimitResult = {
  allowed: boolean
  /** Hits na janela atual (incluindo este). */
  count: number
  /** Segundos até a janela liberar (0 se ainda permitido). */
  retryAfterSec: number
}

/**
 * Registra UM hit em `key` e diz se ainda está dentro do teto. A contagem é
 * feita e comparada no banco (`now()`), então é robusta a relógio do app.
 */
export async function consumeRateLimit(
  key: string,
  opts: { limit: number; windowSec: number }
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt", "updatedAt")
    VALUES (${key}, 1, now() + (${opts.windowSec} * interval '1 second'), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1
                     ELSE "RateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now()
                         THEN now() + (${opts.windowSec} * interval '1 second')
                         ELSE "RateLimit"."expiresAt" END,
      "updatedAt" = now()
    RETURNING "count", "expiresAt"
  `
  const row = rows[0]
  const allowed = row.count <= opts.limit
  const retryAfterSec = allowed
    ? 0
    : Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000))
  return { allowed, count: row.count, retryAfterSec }
}

/**
 * Lê a contagem da janela atual SEM incrementar. Retorna `0` se não há janela
 * ativa (chave ausente ou expirada). Usado p/ pré-checar lockout antes de gastar
 * trabalho caro (ex.: bcrypt no login).
 */
export async function peekRateLimit(key: string): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key } })
  if (!row || row.expiresAt <= new Date()) return 0
  return row.count
}

/** Zera a janela de uma chave (ex.: login bem-sucedido limpa o lockout da conta). */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } })
}

/**
 * Estado da janela: `count` (0 se ausente/expirada) e `remainingSec` (segundos até
 * `expiresAt`). Usado p/ lockouts com tempo restante (ex.: aviso de cooldown no login).
 */
export async function getRateLimitState(
  key: string
): Promise<{ count: number; remainingSec: number }> {
  const row = await prisma.rateLimit.findUnique({ where: { key } })
  if (!row || row.expiresAt <= new Date()) return { count: 0, remainingSec: 0 }
  return {
    count: row.count,
    remainingSec: Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)),
  }
}

/**
 * Grava um bloqueio EXPLÍCITO em `key`: `count` (ex.: nº do strike) + `expiresAt` =
 * now + `seconds`. Diferente de `consumeRateLimit` (janela fixa), aqui a duração é
 * escolhida pelo caller — base p/ cooldown PROGRESSIVO. Atômico (`ON CONFLICT`).
 */
export async function setRateLimitBlock(
  key: string,
  count: number,
  seconds: number
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt", "updatedAt")
    VALUES (${key}, ${count}, now() + (${seconds} * interval '1 second'), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = ${count},
      "expiresAt" = now() + (${seconds} * interval '1 second'),
      "updatedAt" = now()
  `
}
