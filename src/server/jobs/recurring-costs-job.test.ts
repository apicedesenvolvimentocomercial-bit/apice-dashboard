import { describe, expect, it, vi } from 'vitest'

import { spDate } from '@/lib/date'
import { runRecurringCostsJob } from './recurring-costs-job'

type Template = {
  id: string
  organizationId: string
  clientId: string
  type: 'FIXED' | 'VARIABLE' | 'MARKETING' | 'PAYROLL' | 'TAX_REVENUE' | 'OTHER'
  category: string | null
  amount: number
  date: Date
  description: string | null
  recurringDay: number
  campaignId: string | null
  createdById: string | null
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    type: 'FIXED',
    category: 'Aluguel',
    amount: 1000,
    // Cadastrado num mês ANTERIOR ao de referência (mai/2025) — o cron deve
    // gerar o filho do mês corrente. O mês de cadastro é coberto pelo template.
    date: spDate(2025, 0, 15), // 15/jan/2025
    description: 'Aluguel matriz',
    recurringDay: 5,
    campaignId: null,
    createdById: 'user-1',
    ...overrides,
  }
}

function makeMock(opts: { templates: Template[]; existingChildIds?: Set<string> }) {
  const created: Record<string, unknown>[] = []
  const existing = opts.existingChildIds ?? new Set<string>()
  const mock = {
    cost: {
      findMany: vi.fn(async (_args: unknown) => opts.templates),
      findFirst: vi.fn(async (args: unknown) => {
        const id = (args as { where: { recurringSourceId: string } }).where.recurringSourceId
        return existing.has(id) ? { id: 'existing' } : null
      }),
      create: vi.fn(async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data
        created.push(data)
        return { id: `child-${created.length}` }
      }),
    },
  }
  return { mock, created }
}

describe('runRecurringCostsJob', () => {
  const reference = spDate(2025, 4, 11, 12, 0, 0) // 11/mai/2025

  it('cria custo filho para template cujo dia já passou e não tem filho no mês', async () => {
    const { mock, created } = makeMock({ templates: [makeTemplate({ recurringDay: 5 })] })
    const result = await runRecurringCostsJob(reference, mock)
    expect(result.scanned).toBe(1)
    expect(result.created).toBe(1)
    expect(result.skipped).toBe(0)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      organizationId: 'org-1',
      clientId: 'client-1',
      recurringSourceId: 'tpl-1',
      isRecurring: false,
      type: 'FIXED',
      amount: 1000,
    })
    // o filho herda a descrição do template
    expect(created[0].description).toBe('Aluguel matriz')
  })

  it('NÃO cria filho se já existe um para o mês (idempotência)', async () => {
    const { mock, created } = makeMock({
      templates: [makeTemplate()],
      existingChildIds: new Set(['tpl-1']),
    })
    const result = await runRecurringCostsJob(reference, mock)
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(created).toHaveLength(0)
  })

  it('NÃO cria filho no mês em que o template foi cadastrado (baixa manual já cobre)', async () => {
    // Template cadastrado em 3/mai/2025, dia recorrente 5 — o cron roda em
    // 11/mai. O mês de maio já foi lançado no cadastro; não pode duplicar.
    const template = makeTemplate({ recurringDay: 5, date: spDate(2025, 4, 3, 12, 0, 0) })
    const { mock, created } = makeMock({ templates: [template] })
    const result = await runRecurringCostsJob(reference, mock)
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(created).toHaveLength(0)
  })

  it('pula template cujo recurringDay ainda não chegou no mês', async () => {
    const earlyMonth = spDate(2025, 4, 3, 12, 0, 0) // 3/mai
    const { mock, created } = makeMock({ templates: [] })
    // findMany filtra recurringDay <= day, então retorna lista vazia: simulamos isto
    const result = await runRecurringCostsJob(earlyMonth, mock)
    expect(result.scanned).toBe(0)
    expect(created).toHaveLength(0)
  })

  it('ajusta dia 31 para o último dia do mês curto (fevereiro)', async () => {
    const fev = spDate(2025, 1, 28, 12, 0, 0) // 28/fev/2025
    const { mock, created } = makeMock({ templates: [makeTemplate({ recurringDay: 31 })] })
    await runRecurringCostsJob(fev, mock)
    expect(created).toHaveLength(1)
    const childDate = created[0].date as Date
    // 2025 não é bissexto → último dia de fevereiro é 28
    expect(childDate.toISOString().startsWith('2025-02-28')).toBe(true)
  })

  it('usa fallback de descrição quando template não tem description nem category', async () => {
    const { mock, created } = makeMock({
      templates: [makeTemplate({ description: null, category: null })],
    })
    await runRecurringCostsJob(reference, mock)
    expect(created[0].description).toBe('Custo recorrente')
  })

  it('processa múltiplos templates sem que erro em um afete os outros', async () => {
    const tplA = makeTemplate({ id: 'tpl-a' })
    const tplB = makeTemplate({ id: 'tpl-b' })
    let createCount = 0
    const mock = {
      cost: {
        findMany: vi.fn(async (_args: unknown) => [tplA, tplB]),
        findFirst: vi.fn(async (_args: unknown) => null),
        create: vi.fn(async (args: unknown) => {
          const data = (args as { data: Record<string, unknown> }).data
          createCount++
          if (data.recurringSourceId === 'tpl-a') throw new Error('boom')
          return { id: `child-${createCount}` }
        }),
      },
    }
    const result = await runRecurringCostsJob(reference, mock)
    expect(result.scanned).toBe(2)
    expect(result.created).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('persiste recurringSourceId apontando para o template', async () => {
    const { mock, created } = makeMock({ templates: [makeTemplate({ id: 'tpl-xyz' })] })
    await runRecurringCostsJob(reference, mock)
    expect(created[0].recurringSourceId).toBe('tpl-xyz')
    expect(created[0].isRecurring).toBe(false)
  })
})
