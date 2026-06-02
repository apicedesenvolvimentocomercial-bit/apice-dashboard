import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rate-limiting (SEC-002). Prisma mockado por um Map em memória — provamos a lógica
 * de janela/bloqueio sem DB (ambiente é prod; ver ledger).
 */

const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rateLimit: {
      findUnique: vi.fn(
        async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { key: string }
          create: Record<string, unknown>
          update: Record<string, unknown>
        }) => {
          const existing = store.get(where.key)
          const row = existing ? { ...existing, ...update } : { key: where.key, ...create }
          store.set(where.key, row)
          return row
        }
      ),
      update: vi.fn(
        async ({ where, data }: { where: { key: string }; data: Record<string, unknown> }) => {
          const row = { ...(store.get(where.key) ?? {}), ...data }
          store.set(where.key, row)
          return row
        }
      ),
      deleteMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => {
        let count = 0
        for (const k of where.key.in) if (store.delete(k)) count++
        return { count }
      }),
    },
  },
}))

import {
  clearRateLimit,
  isRateLimited,
  registerHit,
  type RateLimitConfig,
} from '@/server/security/rate-limit'

const cfg: RateLimitConfig = { limit: 3, windowMs: 60_000, blockMs: 120_000 }

beforeEach(() => store.clear())

describe('rate-limit', () => {
  it('libera hits abaixo do teto', async () => {
    for (let i = 0; i < cfg.limit; i++) {
      const r = await registerHit('k', cfg)
      expect(r.blocked).toBe(false)
    }
  })

  it('bloqueia ao estourar o teto', async () => {
    for (let i = 0; i < cfg.limit; i++) await registerHit('k', cfg)
    const r = await registerHit('k', cfg) // limit+1
    expect(r.blocked).toBe(true)
    expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it('isRateLimited enxerga o bloqueio sem contar hit', async () => {
    for (let i = 0; i <= cfg.limit; i++) await registerHit('k', cfg)
    const peek = await isRateLimited('k')
    expect(peek.blocked).toBe(true)
  })

  it('reinicia a janela quando ela expira', async () => {
    store.set('k', {
      key: 'k',
      count: 99,
      windowStart: new Date(Date.now() - 10 * 60_000),
      blockedUntil: null,
    })
    const r = await registerHit('k', cfg)
    expect(r.blocked).toBe(false)
    expect(store.get('k')?.count).toBe(1)
  })

  it('mantém o bloqueio enquanto blockedUntil está no futuro', async () => {
    store.set('k', {
      key: 'k',
      count: 10,
      windowStart: new Date(),
      blockedUntil: new Date(Date.now() + 60_000),
    })
    const r = await registerHit('k', cfg)
    expect(r.blocked).toBe(true)
  })

  it('clearRateLimit zera os contadores', async () => {
    await registerHit('a', cfg)
    await registerHit('b', cfg)
    await clearRateLimit(['a', 'b'])
    expect(store.has('a')).toBe(false)
    expect(store.has('b')).toBe(false)
  })
})
