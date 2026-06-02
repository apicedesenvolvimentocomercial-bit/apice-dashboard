import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Política de lockout do login (seguranca-pendencias #1) com cooldown PROGRESSIVO.
 * Mocka o limiter genérico e valida: chaves, thresholds, escalada do cooldown
 * (dobra por strike, teto 1h) e o FAIL-OPEN (erro de infra não tranca ninguém).
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
  clearLoginFailures,
  getLoginLockSeconds,
  isLoginLocked,
  recordLoginFailure,
} from './login-throttle'

const consume = consumeRateLimit as unknown as ReturnType<typeof vi.fn>
const state = getRateLimitState as unknown as ReturnType<typeof vi.fn>
const reset = resetRateLimit as unknown as ReturnType<typeof vi.fn>
const setBlock = setRateLimitBlock as unknown as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

describe('getLoginLockSeconds / isLoginLocked', () => {
  it('0/false quando não há bloqueio', async () => {
    state.mockResolvedValue({ count: 0, remainingSec: 0 })
    expect(await getLoginLockSeconds('a@b.com', '1.2.3.4')).toBe(0)
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(false)
  })

  it('retorna o cooldown da conta (lock) quando ativo', async () => {
    state.mockImplementation(async (key: string) =>
      key.startsWith('login:lock:')
        ? { count: 1, remainingSec: 120 }
        : { count: 0, remainingSec: 0 }
    )
    expect(await getLoginLockSeconds('a@b.com', '1.2.3.4')).toBe(120)
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(true)
  })

  it('bloqueia pelo eixo IP quando count >= 30', async () => {
    state.mockImplementation(async (key: string) =>
      key.startsWith('login:ip:') ? { count: 30, remainingSec: 300 } : { count: 0, remainingSec: 0 }
    )
    expect(await getLoginLockSeconds('a@b.com', '1.2.3.4')).toBe(300)
  })

  it('FAIL-OPEN: erro no limiter não tranca', async () => {
    state.mockRejectedValue(new Error('db down'))
    expect(await getLoginLockSeconds('a@b.com', '1.2.3.4')).toBe(0)
  })
})

describe('recordLoginFailure', () => {
  it('conta os dois eixos (email normalizado) sem bloquear abaixo do teto', async () => {
    consume.mockResolvedValue({ allowed: true, count: 2, retryAfterSec: 0 })
    const r = await recordLoginFailure('User@Example.COM', '1.2.3.4')
    expect(consume).toHaveBeenCalledWith('login:fail:user@example.com:1.2.3.4', {
      limit: 5,
      windowSec: 900,
    })
    expect(consume).toHaveBeenCalledWith('login:ip:1.2.3.4', { limit: 30, windowSec: 900 })
    expect(r).toBe(0)
    expect(setBlock).not.toHaveBeenCalled()
  })

  it('abre cooldown progressivo ao estourar o teto (dobra por strike)', async () => {
    consume.mockImplementation(async (key: string) => {
      if (key.startsWith('login:fail:')) return { allowed: false, count: 5, retryAfterSec: 0 }
      if (key.startsWith('login:strike:')) return { allowed: true, count: 3, retryAfterSec: 0 }
      return { allowed: true, count: 1, retryAfterSec: 0 } // ip
    })
    const cooldown = await recordLoginFailure('a@b.com', '1.2.3.4')
    expect(cooldown).toBe(240) // 60 * 2^(3-1)
    expect(setBlock).toHaveBeenCalledWith('login:lock:a@b.com:1.2.3.4', 3, 240)
    expect(reset).toHaveBeenCalledWith('login:fail:a@b.com:1.2.3.4')
  })

  it('cooldown tem teto de 1h', async () => {
    consume.mockImplementation(async (key: string) => {
      if (key.startsWith('login:fail:')) return { allowed: false, count: 5, retryAfterSec: 0 }
      if (key.startsWith('login:strike:')) return { allowed: true, count: 20, retryAfterSec: 0 }
      return { allowed: true, count: 1, retryAfterSec: 0 }
    })
    expect(await recordLoginFailure('a@b.com', '1.2.3.4')).toBe(3600)
  })

  it('FAIL-OPEN: erro não propaga (retorna 0)', async () => {
    consume.mockRejectedValue(new Error('db down'))
    await expect(recordLoginFailure('a@b.com', '1.2.3.4')).resolves.toBe(0)
  })
})

describe('clearLoginFailures', () => {
  it('zera fail + lock da conta', async () => {
    await clearLoginFailures('A@B.com', '9.9.9.9')
    expect(reset).toHaveBeenCalledWith('login:fail:a@b.com:9.9.9.9')
    expect(reset).toHaveBeenCalledWith('login:lock:a@b.com:9.9.9.9')
  })
})
