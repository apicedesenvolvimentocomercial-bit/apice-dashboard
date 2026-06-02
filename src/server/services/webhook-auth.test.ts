import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Webhook por-clínica (SEC-003). Prova que o token resolve o clientId server-side —
 * o body não escolhe mais a clínica — e que token inválido/clínica deletada = null.
 */

const { store } = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findUnique: vi.fn(
        async ({ where }: { where: { webhookTokenHash: string } }) =>
          store.get(where.webhookTokenHash) ?? null
      ),
    },
  },
}))

import {
  generateWebhookToken,
  hashWebhookToken,
  resolveClientIdByWebhookToken,
} from '@/server/services/webhook-auth'

beforeEach(() => store.clear())

describe('webhook-auth', () => {
  it('hash é determinístico e sensível ao input', () => {
    expect(hashWebhookToken('abc')).toBe(hashWebhookToken('abc'))
    expect(hashWebhookToken('abc')).not.toBe(hashWebhookToken('abd'))
  })

  it('generateWebhookToken devolve token cujo hash bate', () => {
    const { token, hash } = generateWebhookToken()
    expect(hashWebhookToken(token)).toBe(hash)
    expect(token.length).toBeGreaterThan(20)
  })

  it('resolve o clientId a partir de um token válido', async () => {
    const { token, hash } = generateWebhookToken()
    store.set(hash, { id: 'clinic-A', deletedAt: null })
    expect(await resolveClientIdByWebhookToken(token)).toBe('clinic-A')
  })

  it('token desconhecido → null', async () => {
    expect(await resolveClientIdByWebhookToken('nope')).toBeNull()
  })

  it('token vazio → null', async () => {
    expect(await resolveClientIdByWebhookToken('')).toBeNull()
  })

  it('clínica soft-deletada → null', async () => {
    const { token, hash } = generateWebhookToken()
    store.set(hash, { id: 'clinic-A', deletedAt: new Date() })
    expect(await resolveClientIdByWebhookToken(token)).toBeNull()
  })
})
