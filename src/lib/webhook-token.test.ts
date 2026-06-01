import { describe, expect, it } from 'vitest'

import { generateWebhookToken, hashWebhookToken } from './webhook-token'

describe('webhook token (seguranca-pendencias #2)', () => {
  it('o hash guardado bate com o sha256 do token cru', () => {
    const { token, hash } = generateWebhookToken()
    expect(hashWebhookToken(token)).toBe(hash)
  })

  it('o hash é sha256 hex (64 chars) — nunca o token cru', () => {
    const { token, hash } = generateWebhookToken()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toBe(token)
  })

  it('cada chamada gera um token distinto (alta entropia)', () => {
    expect(generateWebhookToken().token).not.toBe(generateWebhookToken().token)
  })
})
