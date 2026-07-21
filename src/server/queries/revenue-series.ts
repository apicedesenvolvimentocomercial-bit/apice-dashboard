import { prisma } from '@/lib/prisma'
import { monthKey, shortMonthLabel, spDate } from '@/lib/date'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Séries mensais de receita × custos usadas pelos gráficos do dashboard e da
 * aba financeiro:
 *
 *  - `revenueByMonth` ("Receita gerada"): valor cheio da venda no mês em que
 *    foi lançada (12 meses passados + atual). Competência — exclui CANCELADA,
 *    como os KPIs (dre-progresso.md).
 *  - `receivedByMonth` ("Receita recebida"): CAIXA REAL a partir das parcelas
 *    (`Receivable`): meses até o atual somam parcelas PAGAS por `paidAt`; meses
 *    futuros somam parcelas PENDENTES por `dueDate` (previsão). Parcela vencida
 *    e não paga NÃO aparece (ela é inadimplência, não caixa). Janela ampla
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
  const now = new Date()
  // Início da janela visível (12 meses atrás) e fronteira passado/futuro.
  const windowStart = spDate(now.getFullYear(), now.getMonth() - 12, 1)
  const nextMonthStart = spDate(now.getFullYear(), now.getMonth() + 1, 1)

  const [revRows, receivableRows, costRows, recurringTemplates] = await Promise.all([
    prisma.revenue.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        status: { not: 'CANCELADA' },
        date: { gte: windowStart },
      },
      select: { amount: true, date: true },
    }),
    // Parcelas para o gráfico de caixa: pagas na janela (por paidAt) +
    // pendentes com vencimento futuro (por dueDate). Parcela PAGA de venda
    // cancelada continua contando — o dinheiro entrou; PENDENTE de cancelada
    // não existe (vira CANCELADO na baixa).
    prisma.receivable.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        revenue: { deletedAt: null },
        OR: [
          { status: 'PAGO', paidAt: { gte: windowStart } },
          { status: 'PENDENTE', dueDate: { gte: nextMonthStart } },
        ],
      },
      select: { amount: true, status: true, paidAt: true, dueDate: true },
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
      select: { id: true, amount: true, date: true, createdAt: true },
    }),
  ])

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

  // Receita gerada: valor cheio no mês da venda.
  for (const r of revRows) {
    const generatedBucket = generatedBuckets.get(monthKey(r.date))
    if (generatedBucket) generatedBucket.revenue += Number(r.amount)
  }

  // Receita recebida (caixa real): PAGO cai no mês do pagamento; PENDENTE só
  // entra em mês FUTURO (previsão por vencimento). O guard `isFuture` garante a
  // semântica mesmo se uma pendente vencida escapar do filtro da query.
  for (const p of receivableRows) {
    if (p.status === 'PAGO' && p.paidAt) {
      const target = receivedBuckets.get(monthKey(p.paidAt))
      if (target) target.revenue += Number(p.amount)
    } else if (p.status === 'PENDENTE') {
      const target = receivedBuckets.get(monthKey(p.dueDate))
      if (target && target.isFuture) target.revenue += Number(p.amount)
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

  // A própria linha do template (isRecurring, excluída de `costRows`) é a
  // despesa do mês em que foi cadastrada — o cron NÃO materializa um filho nesse
  // mês (evita cobrar 2×, ver recurring-costs-job). Conta o valor do template no
  // mês da sua `date` e marca como materializado p/ a projeção não duplicar. O
  // guard `has(t.id)` cobre dados antigos que ainda tenham um filho nesse mês.
  for (const t of recurringTemplates) {
    const key = monthKey(t.date)
    if (materializedRecurringByMonth.get(key)?.has(t.id)) continue
    const gen = generatedBuckets.get(key)
    if (gen) gen.costs += Number(t.amount)
    const rec = receivedBuckets.get(key)
    if (rec) rec.costs += Number(t.amount)
    const set = materializedRecurringByMonth.get(key) ?? new Set<string>()
    set.add(t.id)
    materializedRecurringByMonth.set(key, set)
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
