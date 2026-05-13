import { describe, expect, it, vi } from 'vitest'

import {
  HIGH_MARKETING_SPEND_THRESHOLD,
  INACTIVE_PATIENTS_THRESHOLD,
  NO_SHOW_CRITICAL_THRESHOLD,
  PROCEDURE_CONCENTRATION_THRESHOLD,
  REVENUE_DROP_THRESHOLD,
  SLOW_FIRST_CONTACT_MIN,
} from '@/lib/constants'

import type { PrismaLike, RuleInput } from '../types'

import { goalAtRiskRule } from './goal-at-risk'
import { highMarketingLowRoiRule } from './high-marketing-low-roi'
import { highNoShowRule } from './high-no-show'
import { inactivePatientsRule } from './inactive-patients'
import { lowConversionRule } from './low-conversion'
import { lowMarginRule } from './low-margin'
import { noLeads7dRule } from './no-leads-7d'
import { procedureConcentrationRule } from './procedure-concentration'
import { revenueDropRule } from './revenue-drop'
import { slowFirstContactRule } from './slow-first-contact'

/**
 * Helper para construir um mock de prisma com os métodos que as regras usam.
 * Tipado como PrismaLike via `as unknown as` — o cast é seguro porque cada
 * teste só usa o subconjunto que sua regra invoca.
 */
function makePrisma(overrides: Record<string, unknown> = {}): PrismaLike {
  const base = {
    appointment: { groupBy: vi.fn(), count: vi.fn() },
    revenue: { aggregate: vi.fn(), groupBy: vi.fn() },
    cost: { aggregate: vi.fn() },
    lead: { count: vi.fn(), findMany: vi.fn() },
    patient: { count: vi.fn() },
    procedure: { findUnique: vi.fn() },
    goal: { findMany: vi.fn() },
  }
  return Object.assign(base, overrides) as unknown as PrismaLike
}

const NOW = new Date('2026-05-12T12:00:00Z')

function inputFor(prisma: PrismaLike): RuleInput {
  return { organizationId: 'org', clientId: 'cli', now: NOW, prisma }
}

describe('high-no-show rule', () => {
  it('dispara quando taxa > limiar e total >= 5', async () => {
    const prisma = makePrisma()
    prisma.appointment.groupBy = vi.fn(async () => [
      { status: 'NO_SHOW', _count: { _all: 4 } },
      { status: 'ATTENDED', _count: { _all: 6 } },
    ]) as never
    prisma.revenue.aggregate = vi.fn(async () => ({
      _sum: { amount: 5000 },
      _count: { _all: 5 },
    })) as never

    const result = await highNoShowRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('CRITICAL')
    expect(result!.estimatedImpact).toBeCloseTo(4 * 1000, 5)
  })

  it('não dispara quando total < 5 agendamentos', async () => {
    const prisma = makePrisma()
    prisma.appointment.groupBy = vi.fn(async () => [
      { status: 'NO_SHOW', _count: { _all: 2 } },
      { status: 'ATTENDED', _count: { _all: 2 } },
    ]) as never
    expect(await highNoShowRule.evaluate(inputFor(prisma))).toBeNull()
  })

  it('não dispara quando taxa <= limiar', async () => {
    const prisma = makePrisma()
    prisma.appointment.groupBy = vi.fn(async () => [
      { status: 'NO_SHOW', _count: { _all: 1 } },
      { status: 'ATTENDED', _count: { _all: 19 } },
    ]) as never
    void NO_SHOW_CRITICAL_THRESHOLD
    expect(await highNoShowRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('low-conversion rule', () => {
  it('dispara com leads >= 10 e conversão < 10%', async () => {
    const prisma = makePrisma()
    prisma.lead.count = vi.fn(async ({ where }) => {
      // Primeira chamada: total. Segunda: won.
      if ((where as { stage?: unknown }).stage) return 1
      return 50
    }) as never
    const result = await lowConversionRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('WARNING')
  })

  it('não dispara com poucos leads (< 10)', async () => {
    const prisma = makePrisma()
    prisma.lead.count = vi.fn(async () => 5) as never
    expect(await lowConversionRule.evaluate(inputFor(prisma))).toBeNull()
  })

  it('não dispara com conversão saudável', async () => {
    const prisma = makePrisma()
    prisma.lead.count = vi.fn(async ({ where }) => {
      if ((where as { stage?: unknown }).stage) return 20
      return 100
    }) as never
    expect(await lowConversionRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('low-margin rule', () => {
  it('dispara com margem < 20%', async () => {
    const prisma = makePrisma()
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 10000 } })) as never
    prisma.cost.aggregate = vi.fn(async () => ({ _sum: { amount: 9000 } })) as never
    const result = await lowMarginRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.metadata?.margin).toBeCloseTo(0.1, 5)
  })

  it('não dispara sem receita', async () => {
    const prisma = makePrisma()
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 0 } })) as never
    prisma.cost.aggregate = vi.fn(async () => ({ _sum: { amount: 0 } })) as never
    expect(await lowMarginRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('revenue-drop rule', () => {
  it('dispara com queda > 20% MoM', async () => {
    const prisma = makePrisma()
    let call = 0
    prisma.revenue.aggregate = vi.fn(async () => {
      call++
      if (call === 1) return { _sum: { amount: 7000 } } // mês atual
      return { _sum: { amount: 10000 } } // mês anterior
    }) as never
    const result = await revenueDropRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('CRITICAL')
    void REVENUE_DROP_THRESHOLD
  })

  it('não dispara com mês anterior zerado (divisão por zero)', async () => {
    const prisma = makePrisma()
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 0 } })) as never
    expect(await revenueDropRule.evaluate(inputFor(prisma))).toBeNull()
  })

  it('não dispara com queda menor que limiar', async () => {
    const prisma = makePrisma()
    let call = 0
    prisma.revenue.aggregate = vi.fn(async () => {
      call++
      if (call === 1) return { _sum: { amount: 9500 } }
      return { _sum: { amount: 10000 } }
    }) as never
    expect(await revenueDropRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('no-leads-7d rule', () => {
  it('dispara quando count == 0', async () => {
    const prisma = makePrisma()
    prisma.lead.count = vi.fn(async () => 0) as never
    const result = await noLeads7dRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('WARNING')
  })

  it('não dispara quando há ao menos 1 lead', async () => {
    const prisma = makePrisma()
    prisma.lead.count = vi.fn(async () => 1) as never
    expect(await noLeads7dRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('slow-first-contact rule', () => {
  it('dispara com média > 60 min e amostra >= 5', async () => {
    const prisma = makePrisma()
    // Cria 5 leads com 90 min de delay cada.
    const base = NOW.getTime()
    prisma.lead.findMany = vi.fn(async () =>
      Array.from({ length: 5 }, (_, i) => ({
        createdAt: new Date(base - i * 1000),
        firstContactAt: new Date(base - i * 1000 + 90 * 60 * 1000),
      }))
    ) as never
    const result = await slowFirstContactRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.metadata?.avgMinutes).toBe(90)
    void SLOW_FIRST_CONTACT_MIN
  })

  it('não dispara com amostra < 5', async () => {
    const prisma = makePrisma()
    prisma.lead.findMany = vi.fn(async () => []) as never
    expect(await slowFirstContactRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('procedure-concentration rule', () => {
  it('dispara com >60% concentrado em 1 procedimento', async () => {
    const prisma = makePrisma()
    prisma.revenue.groupBy = vi.fn(async () => [
      { procedureId: 'p1', _sum: { amount: 7000 } },
      { procedureId: 'p2', _sum: { amount: 2000 } },
      { procedureId: 'p3', _sum: { amount: 1000 } },
    ]) as never
    prisma.procedure.findUnique = vi.fn(async () => ({ name: 'Botox' })) as never
    const result = await procedureConcentrationRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('INFO')
    expect(result!.metadata?.procedureName).toBe('Botox')
    void PROCEDURE_CONCENTRATION_THRESHOLD
  })

  it('não dispara com distribuição equilibrada', async () => {
    const prisma = makePrisma()
    prisma.revenue.groupBy = vi.fn(async () => [
      { procedureId: 'p1', _sum: { amount: 3000 } },
      { procedureId: 'p2', _sum: { amount: 3500 } },
      { procedureId: 'p3', _sum: { amount: 3500 } },
    ]) as never
    expect(await procedureConcentrationRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('inactive-patients rule', () => {
  it('dispara com retenção < 20%', async () => {
    const prisma = makePrisma()
    let call = 0
    prisma.patient.count = vi.fn(async () => {
      call++
      if (call === 1) return 100 // base ativa
      return 10 // retornaram
    }) as never
    const result = await inactivePatientsRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.metadata?.retention).toBeCloseTo(0.1, 5)
    void INACTIVE_PATIENTS_THRESHOLD
  })

  it('não dispara com base pequena (< 5)', async () => {
    const prisma = makePrisma()
    prisma.patient.count = vi.fn(async () => 3) as never
    expect(await inactivePatientsRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('goal-at-risk rule', () => {
  it('dispara quando há meta com <50% no fim de período', async () => {
    const endsIn3Days = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000)
    const prisma = makePrisma()
    prisma.goal.findMany = vi.fn(async () => [
      {
        id: 'g1',
        metric: 'REVENUE',
        startDate: new Date(NOW.getTime() - 27 * 24 * 60 * 60 * 1000),
        endDate: endsIn3Days,
        targetValue: 10000,
      },
    ]) as never
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 3000 } })) as never
    const result = await goalAtRiskRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.metadata?.goalId).toBe('g1')
  })

  it('não dispara sem metas no horizonte', async () => {
    const prisma = makePrisma()
    prisma.goal.findMany = vi.fn(async () => []) as never
    expect(await goalAtRiskRule.evaluate(inputFor(prisma))).toBeNull()
  })
})

describe('high-marketing-low-roi rule', () => {
  it('dispara com marketing >= limiar e ROI < 1', async () => {
    const prisma = makePrisma()
    prisma.cost.aggregate = vi.fn(async () => ({ _sum: { amount: 1000 } })) as never
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 1500 } })) as never
    const result = await highMarketingLowRoiRule.evaluate(inputFor(prisma))
    expect(result).not.toBeNull()
    expect(result!.metadata?.roi).toBeCloseTo(0.5, 5)
    void HIGH_MARKETING_SPEND_THRESHOLD
  })

  it('não dispara com marketing abaixo do limiar', async () => {
    const prisma = makePrisma()
    prisma.cost.aggregate = vi.fn(async () => ({ _sum: { amount: 100 } })) as never
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 50 } })) as never
    expect(await highMarketingLowRoiRule.evaluate(inputFor(prisma))).toBeNull()
  })

  it('não dispara com ROI >= 1', async () => {
    const prisma = makePrisma()
    prisma.cost.aggregate = vi.fn(async () => ({ _sum: { amount: 1000 } })) as never
    prisma.revenue.aggregate = vi.fn(async () => ({ _sum: { amount: 3000 } })) as never
    expect(await highMarketingLowRoiRule.evaluate(inputFor(prisma))).toBeNull()
  })
})
