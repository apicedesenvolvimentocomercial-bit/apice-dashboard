import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Política de rate-limit da recuperação de senha. Mocka o limiter genérico e
 * valida: chaves dos dois eixos (conta / IP), thresholds, escalada do cooldown
 * (dobra por strike, teto 1h), o eixo de tentativas de token por IP e o
 * FAIL-OPEN (erro de infra não tranca ninguém).
 */

vi.mock('@/server/security/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, count: 1, retryAfterSec: 0 })),
  getRateLimitState: vi.fn(async () => ({ count: 0, remainingSec: 0 })),
  resetRateLimit: vi.fn(async () => {}),
  setRateLimitBlock: vi.fn(async () => {}),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import {
  consumeRateLimit,
  getRateLimitState,
  resetRateLimit,
  setRateLimitBlock,
} from '@/server/security/rate-limit'

import {
  getResetRequestLockSeconds,
  isResetAttemptLocked,
  isResetRequestLocked,
  recordResetRequest,
  recordResetTokenFailure,
} from './reset-throttle'

const consume = consumeRateLimit as unknown as ReturnType<typeof vi.fn>
const state = getRateLimitState as unknown as ReturnType<typeof vi.fn>
const reset = resetRateLimit as unknown as ReturnType<typeof vi.fn>
const setBlock = setRateLimitBlock as unknown as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

describe('getResetRequestLockSeconds / isResetRequestLocked', () => {
  it('0/false quando não há bloqueio', async () => {
    state.mockResolvedValue({ count: 0, remainingSec: 0 })
    expect(await getResetRequestLockSeconds('a@b.com', '1.2.3.4')).toBe(0)
    expect(await isResetRequestLocked('a@b.com', '1.2.3.4')).toBe(false)
  })

  it('retorna o cooldown da conta (lock) quando ativo', async () => {
    state.mockImplementation(async (key: string) =>
      key.startsWith('reset:acct-lock:')
        ? { count: 1, remainingSec: 300 }
        : { count: 0, remainingSec: 0 }
    )
    expect(await getResetRequestLockSeconds('a@b.com', '1.2.3.4')).toBe(300)
    expect(await isResetRequestLocked('a@b.com', '1.2.3.4')).toBe(true)
  })

  it('bloqueia pelo eixo IP quando count >= 15', async () => {
    state.mockImplementation(async (key: string) =>
      key.startsWith('reset:ip:') ? { count: 15, remainingSec: 600 } : { count: 0, remainingSec: 0 }
    )
    expect(await getResetRequestLockSeconds('a@b.com', '1.2.3.4')).toBe(600)
  })

  it('FAIL-OPEN: erro no limiter não tranca', async () => {
    state.mockRejectedValue(new Error('db down'))
    expect(await getResetRequestLockSeconds('a@b.com', '1.2.3.4')).toBe(0)
  })
})

describe('recordResetRequest', () => {
  it('conta os dois eixos (email normalizado) sem bloquear abaixo do teto', async () => {
    consume.mockResolvedValue({ allowed: true, count: 2, retryAfterSec: 0 })
    const r = await recordResetRequest('User@Example.COM', '1.2.3.4')
    expect(consume).toHaveBeenCalledWith('reset:acct:user@example.com', {
      limit: 3,
      windowSec: 3600,
    })
    expect(consume).toHaveBeenCalledWith('reset:ip:1.2.3.4', { limit: 15, windowSec: 3600 })
    expect(r).toBe(0)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it('abre cooldown progressivo ao estourar o teto da conta (dobra por strike)', async () => {
    consume.mockImplementation(async (key: string) => {
      if (key.startsWith('reset:acct-strike:')) return { allowed: true, count: 3, retryAfterSec: 0 }
      if (key.startsWith('reset:acct:')) return { allowed: false, count: 3, retryAfterSec: 0 }
      return { allowed: true, count: 1, retryAfterSec: 0 } // ip
    })
    const cooldown = await recordResetRequest('a@b.com', '1.2.3.4')
    expect(cooldown).toBe(1200) // 300 * 2^(3-1)
    expect(setBlock).toHaveBeenCalledWith('reset:acct-lock:a@b.com', 3, 1200)
    expect(reset).toHaveBeenCalledWith('reset:acct:a@b.com')
  })

  it('cooldown tem teto de 1h', async () => {
    consume.mockImplementation(async (key: string) => {
      if (key.startsWith('reset:acct-strike:'))
        return { allowed: true, count: 20, retryAfterSec: 0 }
      if (key.startsWith('reset:acct:')) return { allowed: false, count: 3, retryAfterSec: 0 }
      return { allowed: true, count: 1, retryAfterSec: 0 }
    })
    expect(await recordResetRequest('a@b.com', '1.2.3.4')).toBe(3600)
  })

  it('retorna o retryAfter do IP quando só o eixo IP estoura', async () => {
    consume.mockImplementation(async (key: string) => {
      if (key.startsWith('reset:ip:')) return { allowed: false, count: 16, retryAfterSec: 500 }
      return { allowed: true, count: 1, retryAfterSec: 0 } // acct abaixo do teto
    })
    expect(await recordResetRequest('a@b.com', '1.2.3.4')).toBe(500)
  })

  it('FAIL-OPEN: erro não propaga (retorna 0)', async () => {
    consume.mockRejectedValue(new Error('db down'))
    await expect(recordResetRequest('a@b.com', '1.2.3.4')).resolves.toBe(0)
  })
})

describe('tentativas de token (reset-password)', () => {
  it('não bloqueia abaixo do teto de tentativas por IP', async () => {
    state.mockResolvedValue({ count: 5, remainingSec: 120 })
    expect(await isResetAttemptLocked('1.2.3.4')).toBe(false)
  })

  it('bloqueia ao atingir o teto de tentativas por IP', async () => {
    state.mockResolvedValue({ count: 10, remainingSec: 120 })
    expect(await isResetAttemptLocked('1.2.3.4')).toBe(true)
  })

  it('recordResetTokenFailure conta na janela por IP', async () => {
    await recordResetTokenFailure('1.2.3.4')
    expect(consume).toHaveBeenCalledWith('reset:attempt:1.2.3.4', { limit: 10, windowSec: 900 })
  })

  it('FAIL-OPEN: erro no attempt não tranca', async () => {
    state.mockRejectedValue(new Error('db down'))
    expect(await isResetAttemptLocked('1.2.3.4')).toBe(false)
  })
})
