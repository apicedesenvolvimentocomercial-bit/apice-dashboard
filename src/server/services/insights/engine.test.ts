import { describe, expect, it, vi } from 'vitest'

import { runInsightsForClinic } from './engine'
import type { InsightCandidate, InsightRule } from './types'

type FakePrisma = {
  insight: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

function fakeRule(key: string, candidate: InsightCandidate | null): InsightRule {
  return {
    key,
    category: candidate?.category ?? 'OPERATIONAL',
    evaluate: async () => candidate,
  }
}

function candidateFor(key: string): InsightCandidate {
  return {
    ruleKey: key,
    category: 'OPERATIONAL',
    severity: 'WARNING',
    title: 'Teste',
    diagnosis: 'd',
    suggestion: 's',
    estimatedImpact: null,
  }
}

function makePrisma(
  openInsights: { id: string; ruleKey: string; status: string }[] = []
): FakePrisma {
  return {
    insight: {
      findMany: vi.fn(async () => openInsights),
      create: vi.fn(async ({ data }) => ({ id: `new-${data.ruleKey}` })),
      update: vi.fn(async ({ where }) => ({ id: where.id })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  }
}

describe('runInsightsForClinic', () => {
  it('cria novo insight quando regra dispara e não há aberto', async () => {
    const rules = [fakeRule('r1', candidateFor('r1'))]
    const prisma = makePrisma()
    const res = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(res.created).toBe(1)
    expect(res.updated).toBe(0)
    expect(res.resolved).toBe(0)
    expect(prisma.insight.create).toHaveBeenCalledOnce()
  })

  it('atualiza quando insight aberto da mesma regra existe', async () => {
    const rules = [fakeRule('r1', candidateFor('r1'))]
    const prisma = makePrisma([{ id: 'i1', ruleKey: 'r1', status: 'OPEN' }])
    const res = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(res.created).toBe(0)
    expect(res.updated).toBe(1)
    expect(res.resolved).toBe(0)
    expect(prisma.insight.update).toHaveBeenCalledOnce()
  })

  it('resolve insight aberto quando regra não dispara mais', async () => {
    const rules = [fakeRule('r1', null)]
    const prisma = makePrisma([{ id: 'i1', ruleKey: 'r1', status: 'OPEN' }])
    const res = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(res.created).toBe(0)
    expect(res.updated).toBe(0)
    expect(res.resolved).toBe(1)
    expect(prisma.insight.updateMany).toHaveBeenCalledOnce()
  })

  it('não duplica em execuções sucessivas (idempotência)', async () => {
    const rules = [fakeRule('r1', candidateFor('r1'))]
    const prisma = makePrisma([{ id: 'i1', ruleKey: 'r1', status: 'OPEN' }])
    const a = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    const b = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(a.created + b.created).toBe(0)
    expect(a.updated + b.updated).toBe(2)
  })

  it('continua processando demais regras se uma falha', async () => {
    const failing: InsightRule = {
      key: 'fail',
      category: 'OPERATIONAL',
      evaluate: async () => {
        throw new Error('boom')
      },
    }
    const ok = fakeRule('ok', candidateFor('ok'))
    const prisma = makePrisma()
    const res = await runInsightsForClinic('org', 'cli', {
      rules: [failing, ok],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(res.errors).toBe(1)
    expect(res.created).toBe(1)
  })

  it('não resolve insight aberto que pertence a regra fora deste run', async () => {
    const rules = [fakeRule('r1', candidateFor('r1'))]
    const prisma = makePrisma([{ id: 'other', ruleKey: 'r2', status: 'OPEN' }])
    const res = await runInsightsForClinic('org', 'cli', {
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: prisma as any,
    })
    expect(res.resolved).toBe(0)
    expect(prisma.insight.updateMany).not.toHaveBeenCalled()
  })
})
