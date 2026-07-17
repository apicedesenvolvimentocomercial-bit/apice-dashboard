import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Orçamento de mutações/exports (anti-DoS por VOLUME de requests). Mocka o
 * limiter genérico e valida: chaves, janela dupla (rajada + sustentada),
 * retryAfter = janela mais restritiva, o assert (TooManyRequestsError) e o
 * FAIL-OPEN (erro de infra não bloqueia a operação).
 */

vi.mock('@/server/security/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, count: 1, retryAfterSec: 0 })),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { consumeRateLimit } from '@/server/security/rate-limit'
import { TooManyRequestsError } from '@/types/errors'

import {
  assertInsightRecalcBudget,
  assertMutationBudget,
  consumeExportBudget,
  consumeMutationBudget,
} from './mutation-throttle'

const consume = consumeRateLimit as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks não desfaz mockResolvedValue/mockImplementation — restaura o default.
  consume.mockImplementation(async () => ({ allowed: true, count: 1, retryAfterSec: 0 }))
})

describe('consumeMutationBudget', () => {
  it('permite e consome as DUAS janelas (minuto + hora) do usuário', async () => {
    const r = await consumeMutationBudget('user-1')
    expect(r).toEqual({ allowed: true, retryAfterSec: 0 })
    const keys = consume.mock.calls.map((c) => c[0])
    expect(keys).toContain('mut:min:user-1')
    expect(keys).toContain('mut:hr:user-1')
  })

  it('bloqueia quando a janela de RAJADA estoura', async () => {
    consume.mockImplementation(async (key: string) =>
      key.startsWith('mut:min:')
        ? { allowed: false, count: 121, retryAfterSec: 42 }
        : { allowed: true, count: 5, retryAfterSec: 0 }
    )
    const r = await consumeMutationBudget('user-1')
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBe(42)
  })

  it('bloqueia quando a janela SUSTENTADA estoura (retryAfter = a mais longa)', async () => {
    consume.mockImplementation(async (key: string) =>
      key.startsWith('mut:hr:')
        ? { allowed: false, count: 2001, retryAfterSec: 1800 }
        : { allowed: false, count: 200, retryAfterSec: 30 }
    )
    const r = await consumeMutationBudget('user-1')
    expect(r.allowed).toBe(false)
    expect(r.retryAfterSec).toBe(1800)
  })

  it('FAIL-OPEN: limiter indisponível não bloqueia a mutação', async () => {
    consume.mockRejectedValue(new Error('db down'))
    const r = await consumeMutationBudget('user-1')
    expect(r.allowed).toBe(true)
  })
})

describe('assertMutationBudget', () => {
  it('resolve em silêncio quando dentro do orçamento', async () => {
    await expect(assertMutationBudget('user-1')).resolves.toBeUndefined()
  })

  it('lança TooManyRequestsError (429/RATE_LIMITED) ao estourar', async () => {
    consume.mockResolvedValue({ allowed: false, count: 999, retryAfterSec: 17 })
    const err = await assertMutationBudget('user-1').catch((e) => e)
    expect(err).toBeInstanceOf(TooManyRequestsError)
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.statusCode).toBe(429)
    expect(err.retryAfterSec).toBe(17)
  })
})

describe('consumeExportBudget', () => {
  it('usa as chaves de export por usuário (bucket separado das mutações)', async () => {
    const r = await consumeExportBudget('user-2')
    expect(r.allowed).toBe(true)
    const keys = consume.mock.calls.map((c) => c[0])
    expect(keys).toContain('export:min:user-2')
    expect(keys).toContain('export:hr:user-2')
  })

  it('bloqueia com retryAfter quando estoura', async () => {
    consume.mockResolvedValue({ allowed: false, count: 16, retryAfterSec: 33 })
    const r = await consumeExportBudget('user-2')
    expect(r).toEqual({ allowed: false, retryAfterSec: 33 })
  })

  it('FAIL-OPEN em erro de infra', async () => {
    consume.mockRejectedValue(new Error('db down'))
    const r = await consumeExportBudget('user-2')
    expect(r.allowed).toBe(true)
  })
})

describe('assertInsightRecalcBudget', () => {
  it('consome a chave POR CLÍNICA e resolve dentro do teto', async () => {
    await expect(assertInsightRecalcBudget('clinic-9')).resolves.toBeUndefined()
    expect(consume).toHaveBeenCalledWith('insights:recalc:clinic-9', expect.any(Object))
  })

  it('lança TooManyRequestsError ao estourar', async () => {
    consume.mockResolvedValue({ allowed: false, count: 6, retryAfterSec: 200 })
    const err = await assertInsightRecalcBudget('clinic-9').catch((e) => e)
    expect(err).toBeInstanceOf(TooManyRequestsError)
    expect(err.retryAfterSec).toBe(200)
  })

  it('FAIL-OPEN: erro de infra não bloqueia o recálculo', async () => {
    consume.mockRejectedValue(new Error('db down'))
    await expect(assertInsightRecalcBudget('clinic-9')).resolves.toBeUndefined()
  })
})
