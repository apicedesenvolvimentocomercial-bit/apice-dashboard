import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Política de lockout do login (seguranca-pendencias #1). Mocka o limiter genérico
 * e valida: chaves (email normalizado + IP), thresholds e o FAIL-OPEN (erro de
 * infra não tranca ninguém).
 */

vi.mock('@/server/security/rate-limit', () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true, count: 1, retryAfterSec: 0 })),
  peekRateLimit: vi.fn(async () => 0),
  resetRateLimit: vi.fn(async () => {}),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { consumeRateLimit, peekRateLimit, resetRateLimit } from '@/server/security/rate-limit'

import { clearLoginFailures, isLoginLocked, recordLoginFailure } from './login-throttle'

const peek = peekRateLimit as unknown as ReturnType<typeof vi.fn>
const consume = consumeRateLimit as unknown as ReturnType<typeof vi.fn>
const reset = resetRateLimit as unknown as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

describe('isLoginLocked', () => {
  it('false quando ambos os eixos estão abaixo do teto', async () => {
    peek.mockResolvedValue(0)
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(false)
  })

  it('true quando o eixo email+IP atinge 5 falhas', async () => {
    peek.mockImplementation(async (key: string) => (key.startsWith('login:email:') ? 5 : 0))
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(true)
  })

  it('true quando o eixo IP atinge 30 falhas', async () => {
    peek.mockImplementation(async (key: string) => (key.startsWith('login:ip:') ? 30 : 0))
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(true)
  })

  it('FAIL-OPEN: erro no limiter não tranca (retorna false)', async () => {
    peek.mockRejectedValue(new Error('db down'))
    expect(await isLoginLocked('a@b.com', '1.2.3.4')).toBe(false)
  })
})

describe('recordLoginFailure', () => {
  it('incrementa os dois eixos com email normalizado e os limites certos', async () => {
    await recordLoginFailure('User@Example.COM', '1.2.3.4')
    expect(consume).toHaveBeenCalledWith('login:email:user@example.com:1.2.3.4', {
      limit: 5,
      windowSec: 900,
    })
    expect(consume).toHaveBeenCalledWith('login:ip:1.2.3.4', { limit: 30, windowSec: 900 })
  })

  it('FAIL-OPEN: erro no limiter não propaga', async () => {
    consume.mockRejectedValue(new Error('db down'))
    await expect(recordLoginFailure('a@b.com', '1.2.3.4')).resolves.toBeUndefined()
  })
})

describe('clearLoginFailures', () => {
  it('zera só o eixo email+IP daquela conta', async () => {
    await clearLoginFailures('A@B.com', '9.9.9.9')
    expect(reset).toHaveBeenCalledWith('login:email:a@b.com:9.9.9.9')
  })
})
