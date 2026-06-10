import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Isolamento da ingestão por webhook (seguranca-pendencias #2): o `clientId` é o
 * RESOLVIDO server-side (token por-clínica), nunca o do body. Aqui provamos que o
 * lead grava na clínica passada e que um `clientId` no payload é ignorado.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findFirst: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn() },
  },
}))
vi.mock('@/server/tenant/client-scope', () => ({ enterClientScope: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { enterClientScope } from '@/server/tenant/client-scope'

import { ingestLead } from './lead-ingest'

const p = prisma as unknown as {
  client: { findFirst: ReturnType<typeof vi.fn> }
  pipelineStage: { findFirst: ReturnType<typeof vi.fn> }
  lead: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
}
const scope = enterClientScope as unknown as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

function happyPath() {
  p.client.findFirst.mockResolvedValue({ id: 'clinic-A', organizationId: 'org-1' })
  p.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-lead' })
  p.lead.findFirst.mockResolvedValue(null) // sem duplicata recente (decisão N)
  p.lead.create.mockResolvedValue({ id: 'lead-1' })
}

describe('ingestLead', () => {
  it('grava na clínica RESOLVIDA e ignora um clientId injetado no body', async () => {
    happyPath()
    const res = await ingestLead('meta-ads', 'clinic-A', {
      name: 'Fulano',
      // @ts-expect-error — clientId não faz parte do payload: provando que é ignorado
      clientId: 'clinic-B',
    })
    expect(res).toEqual({ ok: true, leadId: 'lead-1' })
    expect(scope).toHaveBeenCalledWith('clinic-A')
    expect(p.client.findFirst.mock.calls[0][0].where.id).toBe('clinic-A')
    const data = p.lead.create.mock.calls[0][0].data
    expect(data.clientId).toBe('clinic-A')
    expect(data.organizationId).toBe('org-1')
    expect(data.source).toBe('META_ADS')
  })

  it('provider desconhecido → unknown-provider (não entra escopo de clínica)', async () => {
    const res = await ingestLead('telegram', 'clinic-A', { name: 'x' })
    expect(res).toEqual({ ok: false, reason: 'unknown-provider' })
    expect(scope).not.toHaveBeenCalled()
  })

  it('payload sem nome → invalid', async () => {
    const res = await ingestLead('whatsapp', 'clinic-A', { name: '' })
    expect(res).toEqual({ ok: false, reason: 'invalid' })
  })

  it('clínica inexistente → client-not-found', async () => {
    p.client.findFirst.mockResolvedValue(null)
    const res = await ingestLead('google-ads', 'clinic-X', { name: 'y' })
    expect(res).toEqual({ ok: false, reason: 'client-not-found' })
  })

  // Decisão N do plano de correções: retry do provedor não duplica o card.
  it('mesmo telefone nas últimas 24h → devolve o lead existente sem criar outro', async () => {
    happyPath()
    p.lead.findFirst.mockResolvedValue({ id: 'lead-existente' })
    const res = await ingestLead('meta-ads', 'clinic-A', {
      name: 'Fulano',
      phone: '+5511999990000',
    })
    expect(res).toEqual({ ok: true, leadId: 'lead-existente', deduped: true })
    expect(p.lead.create).not.toHaveBeenCalled()
    // A janela de 24h está no where (createdAt >= corte).
    const where = p.lead.findFirst.mock.calls[0][0].where
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.OR).toEqual([{ phone: '+5511999990000' }])
  })

  it('sem telefone/e-mail não tenta dedupe (nome colide demais) e cria normal', async () => {
    happyPath()
    const res = await ingestLead('meta-ads', 'clinic-A', { name: 'Fulano' })
    expect(res).toEqual({ ok: true, leadId: 'lead-1' })
    expect(p.lead.findFirst).not.toHaveBeenCalled()
  })
})
