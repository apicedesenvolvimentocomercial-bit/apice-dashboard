import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Lógica do limiter fixed-window (seguranca-pendencias #1). O `prisma` é mockado:
 * `$queryRaw` devolve o `count`/`expiresAt` que o `INSERT ... ON CONFLICT` retorna,
 * e validamos a decisão (allowed/retryAfter) + as chaves de peek/reset. Sem DB.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    rateLimit: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}))

import { prisma } from '@/lib/prisma'

import { consumeRateLimit, peekRateLimit, resetRateLimit } from './rate-limit'

const p = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>
  rateLimit: { findUnique: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> }
}

afterEach(() => vi.clearAllMocks())

describe('consumeRateLimit', () => {
  it('permite enquanto count <= limit', async () => {
    p.$queryRaw.mockResolvedValueOnce([{ count: 5, expiresAt: new Date(Date.now() + 60_000) }])
    const r = await consumeRateLimit('login:ip:1.2.3.4', { limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(true)
    expect(r.count).toBe(5)
    expect(r.retryAfterSec).toBe(0)
  })

  it('bloqueia quando count ultrapassa o limit e devolve retryAfter > 0', async () => {
    p.$queryRaw.mockResolvedValueOnce([{ count: 6, expiresAt: new Date(Date.now() + 30_000) }])
    const r = await consumeRateLimit('login:ip:1.2.3.4', { limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBeGreaterThan(0)
    expect(r.retryAfterSec).toBeLessThanOrEqual(30)
  })
})

describe('peekRateLimit', () => {
  it('0 quando a chave não existe', async () => {
    p.rateLimit.findUnique.mockResolvedValueOnce(null)
    expect(await peekRateLimit('k')).toBe(0)
  })

  it('0 quando a janela já expirou', async () => {
    p.rateLimit.findUnique.mockResolvedValueOnce({
      count: 9,
      expiresAt: new Date(Date.now() - 1_000),
    })
    expect(await peekRateLimit('k')).toBe(0)
  })

  it('devolve o count quando a janela está ativa', async () => {
    p.rateLimit.findUnique.mockResolvedValueOnce({
      count: 4,
      expiresAt: new Date(Date.now() + 10_000),
    })
    expect(await peekRateLimit('k')).toBe(4)
  })
})

describe('resetRateLimit', () => {
  it('deleta exatamente a chave', async () => {
    await resetRateLimit('login:email:a@b.com:1.2.3.4')
    expect(p.rateLimit.deleteMany).toHaveBeenCalledWith({
      where: { key: 'login:email:a@b.com:1.2.3.4' },
    })
  })
})
