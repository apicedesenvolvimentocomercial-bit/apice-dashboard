import { describe, expect, it, vi } from 'vitest'

import { dispatchWithRetry, type RawSendResponse } from './email-retry'

// sleep instantâneo nos testes — não esperamos backoff real.
const noSleep = () => Promise.resolve()
const ctx = { to: 'a@b.com', subject: 'Assunto' }

describe('lib/resend', () => {
  describe('dispatchWithRetry', () => {
    it('sucesso na primeira tentativa retorna ok com id', async () => {
      const send = vi.fn(
        async (): Promise<RawSendResponse> => ({ data: { id: 'eml_1' }, error: null })
      )
      const res = await dispatchWithRetry(send, ctx, { sleepFn: noSleep })
      expect(res).toEqual({ ok: true, id: 'eml_1' })
      expect(send).toHaveBeenCalledTimes(1)
    })

    it('erro retornado no corpo (NÃO lançado) é tratado como falha — era o bug', async () => {
      // Esse é exatamente o caso que passava despercebido: o SDK devolve
      // { data: null, error } sem throw. Antes o codigo seguia como sucesso.
      const send = vi.fn(
        async (): Promise<RawSendResponse> => ({
          data: null,
          error: { name: 'invalid_from_address', message: 'Domain not verified' },
        })
      )
      const onError = vi.fn()
      const res = await dispatchWithRetry(send, { ...ctx, onError }, { sleepFn: noSleep })
      expect(res.ok).toBe(false)
      expect(res).toMatchObject({ error: 'invalid_from_address: Domain not verified' })
      expect(send).toHaveBeenCalledTimes(1) // erro definitivo, sem retry
      expect(onError).toHaveBeenCalledOnce()
    })

    it('rate_limit_exceeded retenta com backoff e sucede na 3a tentativa', async () => {
      const responses: RawSendResponse[] = [
        { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } },
        { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } },
        { data: { id: 'eml_ok' }, error: null },
      ]
      let i = 0
      const send = vi.fn(async (): Promise<RawSendResponse> => responses[i++])
      const sleepFn = vi.fn(noSleep)

      const res = await dispatchWithRetry(send, ctx, { sleepFn })
      expect(res).toEqual({ ok: true, id: 'eml_ok' })
      expect(send).toHaveBeenCalledTimes(3)
      // Dois backoffs (600ms, 1200ms) entre as três tentativas.
      expect(sleepFn).toHaveBeenCalledTimes(2)
      expect(sleepFn).toHaveBeenNthCalledWith(1, 600)
      expect(sleepFn).toHaveBeenNthCalledWith(2, 1200)
    })

    it('rate_limit_exceeded em todas as tentativas falha após esgotar', async () => {
      const send = vi.fn(
        async (): Promise<RawSendResponse> => ({
          data: null,
          error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
        })
      )
      const res = await dispatchWithRetry(send, ctx, { sleepFn: noSleep })
      expect(res.ok).toBe(false)
      expect(res).toMatchObject({ error: 'rate_limit_exceeded: Too many requests' })
      expect(send).toHaveBeenCalledTimes(3)
    })

    it('exceção de rede retenta e sucede', async () => {
      let i = 0
      const send = vi.fn(async (): Promise<RawSendResponse> => {
        if (i++ === 0) throw new Error('ECONNRESET')
        return { data: { id: 'eml_net' }, error: null }
      })
      const res = await dispatchWithRetry(send, ctx, { sleepFn: noSleep })
      expect(res).toEqual({ ok: true, id: 'eml_net' })
      expect(send).toHaveBeenCalledTimes(2)
    })

    it('exceção persistente falha com a mensagem do erro', async () => {
      const send = vi.fn(async (): Promise<RawSendResponse> => {
        throw new Error('network down')
      })
      const onError = vi.fn()
      const res = await dispatchWithRetry(send, { ...ctx, onError }, { sleepFn: noSleep })
      expect(res).toEqual({ ok: false, error: 'network down' })
      expect(send).toHaveBeenCalledTimes(3)
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ thrown: true }))
    })

    it('respeita maxAttempts customizado', async () => {
      const send = vi.fn(async (): Promise<RawSendResponse> => {
        throw new Error('boom')
      })
      const res = await dispatchWithRetry(send, ctx, { sleepFn: noSleep, maxAttempts: 1 })
      expect(res.ok).toBe(false)
      expect(send).toHaveBeenCalledTimes(1)
    })

    it('data sem id retorna ok com id null', async () => {
      const send = vi.fn(async (): Promise<RawSendResponse> => ({ data: null, error: null }))
      const res = await dispatchWithRetry(send, ctx, { sleepFn: noSleep })
      expect(res).toEqual({ ok: true, id: null })
    })
  })
})
