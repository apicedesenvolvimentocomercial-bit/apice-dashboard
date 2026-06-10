/* eslint-disable no-console -- o teste ASSERTA a saída do console (spies) */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

/**
 * Decisão 1.3 do plano de correções: produção NÃO pode ser cega — `info` (resumos
 * de jobs, duração de cron) precisa sair em prod por padrão. O nível é controlado
 * por LOG_LEVEL (debug < info < warn < error); default: debug em dev, info fora.
 */
describe('logger', () => {
  const origNodeEnv = process.env.NODE_ENV
  const origLogLevel = process.env.LOG_LEVEL

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv('NODE_ENV', origNodeEnv ?? 'test')
    if (origLogLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = origLogLevel
  })

  it('info SAI em produção por padrão (resumos de cron não podem sumir)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.LOG_LEVEL
    logger.info('Retention job finished', { clients: 3 })
    expect(console.log).toHaveBeenCalledTimes(1)
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      message: 'Retention job finished',
      clients: 3,
    })
  })

  it('debug NÃO sai em produção por padrão', () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.LOG_LEVEL
    logger.debug('detalhe interno')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('debug sai em desenvolvimento por padrão', () => {
    vi.stubEnv('NODE_ENV', 'development')
    delete process.env.LOG_LEVEL
    logger.debug('detalhe interno')
    expect(console.log).toHaveBeenCalledTimes(1)
  })

  it('LOG_LEVEL=warn silencia info e mantém warn/error', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.LOG_LEVEL = 'warn'
    logger.info('ruído')
    logger.warn('atenção')
    logger.error('quebrou')
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('error sempre sai, mesmo com LOG_LEVEL inválido', () => {
    vi.stubEnv('NODE_ENV', 'production')
    process.env.LOG_LEVEL = 'banana'
    logger.error('quebrou', { code: 'X' })
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})
