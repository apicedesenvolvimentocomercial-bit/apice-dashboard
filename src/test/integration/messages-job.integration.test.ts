import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fila de mensagens — decisões E1/F do plano de correções:
 * - CLAIM atômico por linha (QUEUED→SENDING): duas execuções sobrepostas nunca
 *   despacham a mesma mensagem (mensagem duplicada ao paciente = dano direto).
 * - Falha transitória reagenda com backoff exponencial até MAX_ATTEMPTS;
 *   FAILED é terminal só depois disso.
 * - SENDING órfão (crash entre claim e resultado) é re-enfileirado.
 */

// Provider fake instalado ANTES do import do job (vi.mock é hoisted).
const providerState = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  mode: 'success' as 'success' | 'throw',
}))

vi.mock('@/server/integrations', () => ({
  getWhatsappProvider: () => ({
    name: 'whatsapp' as const,
    status: async () => ({
      provider: 'whatsapp' as const,
      enabled: true,
      mock: true,
      connectedAccount: null,
      lastSyncAt: null,
    }),
    sendMessage: async ({ to }: { to: string }) => {
      providerState.counts.set(to, (providerState.counts.get(to) ?? 0) + 1)
      if (providerState.mode === 'throw') throw new Error('provider indisponível')
      return { externalId: `ext-${to}`, status: 'sent' as const }
    },
  }),
}))

import { prisma } from '@/lib/prisma'
import { runOutsideClientScope } from '@/server/tenant/client-scope'
import { backoffMinutes, MAX_ATTEMPTS, runMessagesJob } from '@/server/jobs/messages-job'
import { RETENTION_TEMPLATE_KEYS } from '@/server/services/message-service'

import {
  assertTestDatabase,
  disconnectAdmin,
  getAdminPrisma,
  resetDb,
  seedBaseline,
  type Baseline,
} from './db'

const MINUTE = 60_000

describe('messages-job (claim + retry)', () => {
  let base: Baseline

  beforeAll(async () => {
    assertTestDatabase()
    await resetDb()
    base = await seedBaseline()
  })

  beforeEach(async () => {
    providerState.counts.clear()
    providerState.mode = 'success'
    await getAdminPrisma().outboundMessage.deleteMany({})
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await disconnectAdmin()
  })

  function queueMessage(to: string, overrides?: { status?: 'QUEUED' | 'SENDING' }) {
    return getAdminPrisma().outboundMessage.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        channel: 'WHATSAPP',
        templateKey: RETENTION_TEMPLATE_KEYS.POST_CARE,
        payload: { to, nome: 'Teste', procedimento: 'Limpeza', clinica: 'Alpha' },
        status: overrides?.status ?? 'QUEUED',
        scheduledFor: new Date(Date.now() - MINUTE),
      },
      select: { id: true },
    })
  }

  it('duas execuções concorrentes despacham cada mensagem EXATAMENTE uma vez', async () => {
    const tos = Array.from({ length: 20 }, (_, i) => `+5511990000${String(i).padStart(2, '0')}`)
    for (const to of tos) await queueMessage(to)

    await runOutsideClientScope(async () => {
      await Promise.all([runMessagesJob(), runMessagesJob()])
    })

    for (const to of tos) {
      expect(providerState.counts.get(to), `mensagem p/ ${to}`).toBe(1)
    }
    const statuses = await getAdminPrisma().outboundMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    })
    expect(statuses).toEqual([{ status: 'SENT', _count: { _all: 20 } }])
  })

  it('falha transitória: reagenda com backoff, não re-tenta antes da hora, e FAILED só após MAX_ATTEMPTS', async () => {
    providerState.mode = 'throw'
    const { id } = await queueMessage('+5511999990001')
    let now = new Date()

    // 1ª tentativa: falha → volta p/ QUEUED com nextAttemptAt futuro.
    await runOutsideClientScope(() => runMessagesJob(now))
    let row = await getAdminPrisma().outboundMessage.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('QUEUED')
    expect(row.attempts).toBe(1)
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime())

    // Mesmo instante: NÃO é elegível de novo (backoff respeitado).
    await runOutsideClientScope(() => runMessagesJob(now))
    expect(providerState.counts.get('+5511999990001')).toBe(1)

    // Avança o relógio além de cada backoff até esgotar as tentativas.
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      now = new Date(now.getTime() + (backoffMinutes(attempt - 1) + 1) * MINUTE)
      await runOutsideClientScope(() => runMessagesJob(now))
    }
    row = await getAdminPrisma().outboundMessage.findUniqueOrThrow({ where: { id } })
    expect(providerState.counts.get('+5511999990001')).toBe(MAX_ATTEMPTS)
    expect(row.status).toBe('FAILED')
    expect(row.error).toContain('provider indisponível')
  })

  it('SENDING órfão (crash) é recuperado e despachado', async () => {
    const { id } = await queueMessage('+5511999990002', { status: 'SENDING' })
    // Simula claim antigo: updatedAt 1h atrás (crash entre claim e envio).
    await getAdminPrisma().$executeRaw`
      UPDATE "OutboundMessage"
      SET "updatedAt" = NOW() - INTERVAL '60 minutes'
      WHERE "id" = ${id}
    `

    await runOutsideClientScope(() => runMessagesJob())

    const row = await getAdminPrisma().outboundMessage.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('SENT')
    expect(providerState.counts.get('+5511999990002')).toBe(1)
  })

  it('sem contato → SKIPPED (comportamento preservado)', async () => {
    await getAdminPrisma().outboundMessage.create({
      data: {
        organizationId: base.organizationId,
        clientId: base.clinicAId,
        channel: 'WHATSAPP',
        templateKey: RETENTION_TEMPLATE_KEYS.POST_CARE,
        payload: { nome: 'Sem Fone' },
        status: 'QUEUED',
        scheduledFor: new Date(Date.now() - MINUTE),
      },
    })

    const result = await runOutsideClientScope(() => runMessagesJob())

    expect(result.skipped).toBe(1)
    const row = await getAdminPrisma().outboundMessage.findFirstOrThrow({})
    expect(row.status).toBe('SKIPPED')
  })
})
