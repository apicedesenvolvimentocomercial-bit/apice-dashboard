import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Mapeia o estado do banco -> DREInput (ledger dre-progresso.md, mapa input→fonte).
 * `prisma` mockado; valida os buckets (receita por tipo, deduções, CSP, OPEX, etc.).
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    revenue: { groupBy: vi.fn(), aggregate: vi.fn() },
    receivable: { aggregate: vi.fn() },
    cost: { groupBy: vi.fn() },
    fixedAsset: { findMany: vi.fn(async () => []) },
  },
}))

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

import { buildDreInput } from './build-dre-input'

const p = prisma as unknown as {
  revenue: { groupBy: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> }
  receivable: { aggregate: ReturnType<typeof vi.fn> }
  cost: { groupBy: ReturnType<typeof vi.fn> }
  fixedAsset: { findMany: ReturnType<typeof vi.fn> }
}

const ctx = {
  organizationId: 'org-1',
  clientId: 'c1',
  userId: 'u1',
  role: 'ADMIN',
} as TenantContext
const range = { from: new Date('2026-01-01'), to: new Date('2026-01-31') }

afterEach(() => vi.clearAllMocks())

describe('buildDreInput', () => {
  it('mapeia receita por tipo, deduções, CSP e OPEX nos buckets certos', async () => {
    p.revenue.groupBy.mockResolvedValueOnce([
      { type: 'PROCEDIMENTO', _sum: { amount: 10000 } },
      { type: 'PRODUTO', _sum: { amount: 2000 } },
      { type: 'FINANCEIRA', _sum: { amount: 50 } },
    ])
    // 1ª aggregate = descontos; 2ª = cancelamentos (ordem do Promise.all)
    p.revenue.aggregate
      .mockResolvedValueOnce({ _sum: { discount: 400 } })
      .mockResolvedValueOnce({ _sum: { amount: 300 } })
    p.receivable.aggregate.mockResolvedValueOnce({ _sum: { amount: 80 } })
    p.cost.groupBy.mockResolvedValueOnce([
      { type: 'VARIABLE', category: 'Procedimento', _sum: { amount: 1500 } },
      { type: 'VARIABLE', category: 'Insumos', _sum: { amount: 60 } },
      { type: 'MARKETING', category: null, _sum: { amount: 900 } },
      { type: 'COMMERCIAL', category: null, _sum: { amount: 350 } },
      { type: 'ADMINISTRATIVE', category: null, _sum: { amount: 300 } },
      { type: 'PAYROLL', category: null, _sum: { amount: 200 } },
      { type: 'FIXED', category: null, _sum: { amount: 100 } },
      { type: 'COMMISSION', category: null, _sum: { amount: 500 } },
      { type: 'FINANCIAL_EXPENSE', category: null, _sum: { amount: 150 } },
      { type: 'TAX_REVENUE', category: null, _sum: { amount: 600 } },
      { type: 'TAX_PROFIT', category: null, _sum: { amount: 250 } },
    ])

    const dre = await buildDreInput(ctx, 'c1', range)

    // receita por tipo
    expect(dre.receitaProcedimentos).toBe(10000)
    expect(dre.receitaProdutos).toBe(2000)
    expect(dre.receitaPacotes).toBe(0)
    expect(dre.receitasFinanceiras).toBe(50)
    // deduções
    expect(dre.descontos).toBe(400)
    expect(dre.cancelamentos).toBe(300)
    expect(dre.inadimplencia).toBe(80)
    expect(dre.impostosSobreReceita).toBe(600)
    // CSP
    expect(dre.custoProdutos).toBe(1500) // VARIABLE + categoria Procedimento
    expect(dre.custosOperacionaisDiretos).toBe(60) // VARIABLE não-procedimento
    expect(dre.comissoes).toBe(500)
    // OPEX
    expect(dre.despesasMarketing).toBe(900)
    expect(dre.despesasComerciais).toBe(350)
    expect(dre.despesasAdministrativas).toBe(600) // ADMIN + PAYROLL + FIXED
    // financeiro / imposto lucro
    expect(dre.despesasFinanceiras).toBe(150)
    expect(dre.impostoSobreLucro).toBe(250)
  })

  it('exclui CANCELADA da receita (filtro status passado ao prisma)', async () => {
    p.revenue.groupBy.mockResolvedValueOnce([])
    p.revenue.aggregate
      .mockResolvedValueOnce({ _sum: { discount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
    p.receivable.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } })
    p.cost.groupBy.mockResolvedValueOnce([])

    await buildDreInput(ctx, 'c1', range)

    const whereGroupBy = p.revenue.groupBy.mock.calls[0][0].where
    expect(whereGroupBy.status).toEqual({ not: 'CANCELADA' })
    expect(whereGroupBy.clientId).toBe('c1')
  })
})
