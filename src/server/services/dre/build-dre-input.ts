import type { CostType, RevenueType } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'
import { PROCEDURE_COST_CATEGORY } from '@/server/repositories/revenue-repository'

import type { DREInput } from './calcular-dre'
import { depreciationForPeriod } from './depreciation'

/**
 * Monta o `DREInput` de uma clínica para um período, em COMPETÊNCIA (ledger
 * dre-progresso.md, mapa input→fonte). Filtra por org + clientId (belt) — o caller
 * (dre-queries) já entrou no escopo de RLS. Reconhece receita por `Revenue.date`,
 * exclui CANCELADA; recebimento/inadimplência vêm das parcelas; depreciação dos ativos.
 */
export async function buildDreInput(
  ctx: TenantContext,
  clientId: string,
  range: { from: Date; to: Date }
): Promise<DREInput> {
  const tenant = { organizationId: ctx.organizationId, clientId, deletedAt: null }
  const inRange = { gte: range.from, lte: range.to }

  const [revenuesByType, discountAgg, canceledAgg, writeOffAgg, costsGrouped, assets] =
    await Promise.all([
      // Receita reconhecida (competência) por tipo — exclui CANCELADA.
      prisma.revenue.groupBy({
        by: ['type'],
        where: { ...tenant, status: { not: 'CANCELADA' }, date: inRange },
        _sum: { amount: true },
      }),
      // Descontos concedidos no período (dedução).
      prisma.revenue.aggregate({
        where: { ...tenant, status: { not: 'CANCELADA' }, date: inRange },
        _sum: { discount: true },
      }),
      // Cancelamentos: vendas canceladas NO período do cancelamento (dedução).
      prisma.revenue.aggregate({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          status: 'CANCELADA',
          canceledAt: inRange,
        },
        _sum: { amount: true },
      }),
      // Inadimplência: parcelas baixadas como perda (write-off). `updatedAt` é o
      // proxy da data da baixa (não há campo dedicado — MVP).
      prisma.receivable.aggregate({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          status: 'PERDIDO',
          updatedAt: inRange,
        },
        _sum: { amount: true },
      }),
      // Custos/despesas por tipo+categoria.
      prisma.cost.groupBy({
        by: ['type', 'category'],
        where: { ...tenant, date: inRange },
        _sum: { amount: true },
      }),
      // Ativos p/ depreciação/amortização do período.
      prisma.fixedAsset.findMany({
        where: { organizationId: ctx.organizationId, clientId, deletedAt: null },
        select: {
          kind: true,
          acquisitionValue: true,
          residualValue: true,
          acquisitionDate: true,
          usefulLifeMonths: true,
          disposedAt: true,
        },
      }),
    ])

  // --- Receita por tipo ---
  const revByType = new Map<RevenueType, number>()
  for (const r of revenuesByType) revByType.set(r.type, Number(r._sum.amount ?? 0))
  const rev = (t: RevenueType) => revByType.get(t) ?? 0

  // --- Custos por tipo (somando categorias) + CSP de procedimento por categoria ---
  const costByType = new Map<CostType, number>()
  let custoProdutos = 0
  let custosOperacionaisDiretos = 0
  for (const g of costsGrouped) {
    const amount = Number(g._sum.amount ?? 0)
    costByType.set(g.type, (costByType.get(g.type) ?? 0) + amount)
    if (g.type === 'VARIABLE') {
      if (g.category === PROCEDURE_COST_CATEGORY) custoProdutos += amount
      else custosOperacionaisDiretos += amount
    }
  }
  const cost = (t: CostType) => costByType.get(t) ?? 0

  const { depreciacao, amortizacao } = depreciationForPeriod(
    assets.map((a) => ({
      kind: a.kind,
      acquisitionValue: Number(a.acquisitionValue),
      residualValue: Number(a.residualValue),
      acquisitionDate: a.acquisitionDate,
      usefulLifeMonths: a.usefulLifeMonths,
      disposedAt: a.disposedAt,
    })),
    range
  )

  return {
    // Receitas operacionais
    receitaProcedimentos: rev('PROCEDIMENTO'),
    receitaPacotes: rev('PACOTE'),
    receitaRecorrencia: rev('RECORRENCIA'),
    receitaProdutos: rev('PRODUTO'),
    outrasReceitas: rev('OUTRA'),
    // Deduções
    impostosSobreReceita: cost('TAX_REVENUE'),
    cancelamentos: Number(canceledAgg._sum.amount ?? 0),
    inadimplencia: Number(writeOffAgg._sum.amount ?? 0),
    descontos: Number(discountAgg._sum.discount ?? 0),
    // CSP
    custoProdutos,
    comissoes: cost('COMMISSION'),
    custosOperacionaisDiretos,
    // OPEX
    despesasMarketing: cost('MARKETING'),
    despesasComerciais: cost('COMMERCIAL'),
    despesasAdministrativas: cost('ADMINISTRATIVE') + cost('PAYROLL') + cost('FIXED'),
    // Financeiro / não-caixa
    despesasFinanceiras: cost('FINANCIAL_EXPENSE'),
    receitasFinanceiras: rev('FINANCEIRA'),
    depreciacao,
    amortizacao,
    // Imposto sobre lucro (IRPJ/CSLL)
    impostoSobreLucro: cost('TAX_PROFIT'),
  }
}
