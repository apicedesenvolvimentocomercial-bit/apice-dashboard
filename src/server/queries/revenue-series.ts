import { prisma } from '@/lib/prisma'
import { monthKey, shortMonthLabel, spDate } from '@/lib/date'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Séries mensais de receita × custos usadas pelos gráficos do dashboard e da
 * aba financeiro:
 *
 *  - `revenueByMonth` ("Receita gerada"): valor cheio da venda no mês em que
 *    foi lançada (12 meses passados + atual).
 *  - `receivedByMonth` ("Receita recebida"): simulação de fluxo de caixa — cada
 *    parcela (valor ÷ installments) cai no seu mês de competência. Janela ampla
 *    (12 passados + atual + 12 futuros). Meses futuros projetam custos
 *    recorrentes (templates `isRecurring`) ainda não materializados.
 *  - `receivedCenterIndex`: índice do mês atual dentro de `receivedByMonth`.
 *
 * Extraída de `getClinicDashboard` para ser reusada sem duplicar a lógica.
 * Pressupõe que o caller já validou o acesso à clínica (`assertClientAccess` /
 * `assertCan`); recebe o contexto de tenant para escopar as queries.
 */
export type RevenueMonthlySeries = {
  revenueByMonth: { month: string; revenue: number; costs: number }[]
  receivedByMonth: { month: string; revenue: number; costs: number; isFuture: boolean }[]
  receivedCenterIndex: number
}

export async function getRevenueMonthlySeries(
  ctx: TenantContext,
  clientId: string
): Promise<RevenueMonthlySeries> {
  const [revRows, costRows, recurringTemplates] = await Promise.all([
    prisma.revenue.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        // Janela ampliada para 36 meses atrás: cobre parcelas com prazos
        // longos cujas parcelas ainda caem dentro da janela visível.
        date: { gte: spDate(new Date().getFullYear() - 3, new Date().getMonth() + 1, 1) },
      },
      select: { amount: true, date: true, installments: true },
    }),
    // Custos materializados (não-templates) dos últimos 12 meses + atual.
    prisma.cost.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        isRecurring: false,
        date: { gte: spDate(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1) },
      },
      select: { amount: true, date: true, recurringSourceId: true },
    }),
    // Templates de custos recorrentes (fixos) ativos. Usados para projetar
    // o futuro e descontar das materializações já existentes.
    prisma.cost.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        isRecurring: true,
      },
      select: { id: true, amount: true, createdAt: true },
    }),
  ])

  const now = new Date()

  // Bucket "Receita gerada": 12 meses passados + atual.
  const generatedBuckets = new Map<string, { revenue: number; costs: number; label: string }>()
  for (let i = 11; i >= 0; i--) {
    const first = spDate(now.getFullYear(), now.getMonth() - i, 1)
    generatedBuckets.set(monthKey(first), {
      revenue: 0,
      costs: 0,
      label: shortMonthLabel(first),
    })
  }

  // Bucket "Receita recebida": janela ampla com 12 passados + atual + 12 futuros.
  // Cada entrada sabe se é futuro (para projetar custos recorrentes e marcar
  // visualmente na UI). currentMonthStart é a fronteira passado/futuro.
  const currentMonthStart = spDate(now.getFullYear(), now.getMonth(), 1).getTime()
  type ReceivedBucket = {
    revenue: number
    costs: number
    label: string
    monthStart: number
    isFuture: boolean
  }
  const receivedBuckets = new Map<string, ReceivedBucket>()
  let receivedCenterIndex = 0
  {
    let idx = 0
    for (let i = -12; i <= 12; i++) {
      const first = spDate(now.getFullYear(), now.getMonth() + i, 1)
      if (i === 0) receivedCenterIndex = idx
      receivedBuckets.set(monthKey(first), {
        revenue: 0,
        costs: 0,
        label: shortMonthLabel(first),
        monthStart: first.getTime(),
        isFuture: first.getTime() > currentMonthStart,
      })
      idx++
    }
  }

  for (const r of revRows) {
    const amount = Number(r.amount)
    const installments = r.installments && r.installments > 0 ? r.installments : 1

    // Receita gerada: valor cheio no mês da venda.
    const generatedBucket = generatedBuckets.get(monthKey(r.date))
    if (generatedBucket) generatedBucket.revenue += amount

    // Receita recebida: 1 parcela = amount / installments por mês,
    // a partir do mês de `r.date`. Parcelas fora da janela são descartadas.
    const perInstallment = amount / installments
    const baseYear = r.date.getFullYear()
    const baseMonth = r.date.getMonth()
    for (let i = 0; i < installments; i++) {
      const month = spDate(baseYear, baseMonth + i, 1)
      const target = receivedBuckets.get(monthKey(month))
      if (target) target.revenue += perInstallment
    }
  }

  // Custos materializados (rows reais). Para o bucket "recebida", também
  // contamos quantos templates recorrentes JÁ foram materializados em cada
  // mês, para não duplicar quando projetarmos o futuro.
  const materializedRecurringByMonth = new Map<string, Set<string>>()
  for (const c of costRows) {
    const key = monthKey(c.date)
    const amount = Number(c.amount)
    const gen = generatedBuckets.get(key)
    if (gen) gen.costs += amount
    const rec = receivedBuckets.get(key)
    if (rec) rec.costs += amount
    if (c.recurringSourceId) {
      const set = materializedRecurringByMonth.get(key) ?? new Set<string>()
      set.add(c.recurringSourceId)
      materializedRecurringByMonth.set(key, set)
    }
  }

  // Projeção de custos recorrentes: a partir do mês atual em diante, para
  // cada template ativo (createdAt <= início desse mês), adiciona o valor
  // se ainda não foi materializado naquele mês.
  for (const [key, bucket] of receivedBuckets) {
    if (bucket.monthStart < currentMonthStart) continue // passado: confia no materializado
    const materializedSet = materializedRecurringByMonth.get(key) ?? new Set<string>()
    for (const t of recurringTemplates) {
      if (t.createdAt.getTime() > bucket.monthStart) continue
      if (materializedSet.has(t.id)) continue
      bucket.costs += Number(t.amount)
    }
  }

  const revenueByMonth = Array.from(generatedBuckets.values()).map((b) => ({
    month: b.label,
    revenue: b.revenue,
    costs: b.costs,
  }))
  const receivedByMonth = Array.from(receivedBuckets.values()).map((b) => ({
    month: b.label,
    revenue: b.revenue,
    costs: b.costs,
    isFuture: b.isFuture,
  }))

  return { revenueByMonth, receivedByMonth, receivedCenterIndex }
}
