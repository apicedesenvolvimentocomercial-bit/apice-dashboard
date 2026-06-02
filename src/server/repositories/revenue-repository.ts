import { Prisma, type RevenueType } from '@prisma/client'
import { addMonths } from 'date-fns'

import { prisma } from '@/lib/prisma'
import { monthKey, shortMonthLabel, spDate } from '@/lib/date'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

export type RevenueRow = Awaited<ReturnType<typeof listRevenues>>[number]

export async function listRevenues(
  ctx: TenantContext,
  clientId: string,
  filters?: {
    from?: Date
    to?: Date
    paymentMethod?: string
    patientId?: string
    procedureId?: string
  }
) {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters?.patientId ? { patientId: filters.patientId } : {}),
      ...(filters?.procedureId ? { procedureId: filters.procedureId } : {}),
      ...(filters?.from || filters?.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      amount: true,
      date: true,
      description: true,
      paymentMethod: true,
      installments: true,
      status: true,
      type: true,
      createdAt: true,
      patient: { select: { id: true, name: true } },
      procedure: { select: { id: true, name: true } },
      procedures: {
        select: {
          procedureId: true,
          price: true,
          procedure: { select: { name: true } },
        },
      },
    },
  })

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    procedures: r.procedures.map((p) => ({
      procedureId: p.procedureId,
      name: p.procedure.name,
      price: Number(p.price),
    })),
  }))
}

// Item de procedimento usado ao criar/editar uma receita.
export type RevenueProcedureInput = {
  procedureId: string
  name: string
  price: number
  cost: number
}

export const PROCEDURE_COST_CATEGORY = 'Procedimento'

// Métodos "à vista": a parcela única já nasce PAGA na data (entrou no caixa). Os
// demais (crédito/transferência/sem método) nascem PENDENTE (a receber).
const CASH_METHODS = new Set(['CASH', 'PIX', 'DEBIT_CARD'])

// Divide um total em N parcelas iguais em centavos; o resto vai nas primeiras.
function splitAmount(total: number, n: number): number[] {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rem = cents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100)
}

// Monta as parcelas (contas a receber) de uma receita + o status resultante da
// venda. À vista 1x → 1 parcela PAGA na data (QUITADA). Parcelado/prazo → N
// parcelas PENDENTE, vencendo mês a mês a partir da data (ABERTA).
function buildReceivables(opts: {
  amount: number
  installments?: number
  date: Date
  paymentMethod?: string
}): {
  rows: {
    installmentNumber: number
    amount: number
    dueDate: Date
    status: 'PENDENTE' | 'PAGO'
    paidAt: Date | null
    paymentMethod: string | null
  }[]
  status: 'ABERTA' | 'QUITADA'
} {
  const n = Math.max(1, opts.installments ?? 1)
  const parts = splitAmount(opts.amount, n)
  const paidUpfront = n === 1 && !!opts.paymentMethod && CASH_METHODS.has(opts.paymentMethod)
  const rows = parts.map((amt, i) => ({
    installmentNumber: i + 1,
    amount: amt,
    dueDate: addMonths(opts.date, i),
    status: (paidUpfront ? 'PAGO' : 'PENDENTE') as 'PENDENTE' | 'PAGO',
    paidAt: paidUpfront ? opts.date : null,
    paymentMethod: opts.paymentMethod ?? null,
  }))
  return { rows, status: rows.every((r) => r.status === 'PAGO') ? 'QUITADA' : 'ABERTA' }
}

/**
 * `data` de `revenue.create` para receita reconhecida e QUITADA na hora — usado nas
 * baixas automáticas (comparecer/fechar card/converter lead): bruto = líquido, sem
 * desconto, 1 parcela PAGA na data (mantém o caixa coerente). Use dentro de uma op
 * já no escopo da clínica (RLS). Inclui FK escalares + nested write das parcelas.
 */
export function buildPaidRevenueData(opts: {
  organizationId: string
  clientId: string
  amount: Prisma.Decimal | number
  date: Date
  type?: RevenueType
  patientId?: string
  procedureId?: string
  appointmentId?: string
  description?: string
  paymentMethod?: string
  createdById?: string
  // Custo do procedimento (CSP). Quando > 0, gera um Cost VARIABLE ligado a esta
  // receita na MESMA criação — senão a baixa automática (fechar card / baixa pela
  // agenda) registrava só receita e a margem ficava sempre 100%.
  cost?: number
}): Prisma.RevenueUncheckedCreateInput {
  return {
    organizationId: opts.organizationId,
    clientId: opts.clientId,
    type: opts.type ?? 'PROCEDIMENTO',
    grossAmount: opts.amount,
    discount: 0,
    amount: opts.amount,
    status: 'QUITADA',
    date: opts.date,
    ...(opts.patientId ? { patientId: opts.patientId } : {}),
    ...(opts.procedureId ? { procedureId: opts.procedureId } : {}),
    ...(opts.appointmentId ? { appointmentId: opts.appointmentId } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.paymentMethod ? { paymentMethod: opts.paymentMethod } : {}),
    ...(opts.createdById ? { createdById: opts.createdById } : {}),
    ...(opts.cost && opts.cost > 0
      ? {
          costs: {
            create: [
              {
                organizationId: opts.organizationId,
                clientId: opts.clientId,
                type: 'VARIABLE' as const,
                category: PROCEDURE_COST_CATEGORY,
                amount: opts.cost,
                date: opts.date,
                description: opts.description ?? 'Custo do procedimento',
                isRecurring: false,
                ...(opts.createdById ? { createdById: opts.createdById } : {}),
              },
            ],
          },
        }
      : {}),
    receivables: {
      create: [
        {
          organizationId: opts.organizationId,
          clientId: opts.clientId,
          installmentNumber: 1,
          amount: opts.amount,
          dueDate: opts.date,
          status: 'PAGO',
          paidAt: opts.date,
          paymentMethod: opts.paymentMethod ?? null,
        },
      ],
    },
  }
}

/**
 * `data` de `revenue.create` para a baixa de um agendamento/card COM detalhes de
 * pagamento (forma, parcelas, desconto) — mesmo nível do registro manual. Deriva
 * bruto/desconto/líquido do preço do procedimento + desconto%, gera as parcelas
 * (PAGO à vista em 1x dinheiro; PENDENTE no parcelado) e o Cost do procedimento.
 * Usado pela baixa da agenda e pelo card→Fechado quando o usuário informa detalhes.
 */
export function buildAppointmentRevenueData(opts: {
  organizationId: string
  clientId: string
  patientId: string
  procedureId: string
  appointmentId: string
  procedureName: string
  price: number
  cost: number
  date: Date
  paymentMethod?: string
  installments?: number
  discountPct?: number
  createdById?: string
}): Prisma.RevenueUncheckedCreateInput {
  const gross = opts.price
  const discount = Math.round(gross * ((opts.discountPct ?? 0) / 100) * 100) / 100
  const amount = Math.round((gross - discount) * 100) / 100
  const { rows, status } = buildReceivables({
    amount,
    installments: opts.installments,
    date: opts.date,
    paymentMethod: opts.paymentMethod,
  })
  return {
    organizationId: opts.organizationId,
    clientId: opts.clientId,
    type: 'PROCEDIMENTO',
    grossAmount: gross,
    discount,
    amount,
    status,
    date: opts.date,
    installments: opts.installments ?? 1,
    patientId: opts.patientId,
    procedureId: opts.procedureId,
    appointmentId: opts.appointmentId,
    description: `Procedimento: ${opts.procedureName}`,
    ...(opts.paymentMethod ? { paymentMethod: opts.paymentMethod } : {}),
    ...(opts.createdById ? { createdById: opts.createdById } : {}),
    ...(opts.cost > 0
      ? {
          costs: {
            create: [
              {
                organizationId: opts.organizationId,
                clientId: opts.clientId,
                type: 'VARIABLE' as const,
                category: PROCEDURE_COST_CATEGORY,
                amount: opts.cost,
                date: opts.date,
                description: `Procedimento: ${opts.procedureName}`,
                isRecurring: false,
                ...(opts.createdById ? { createdById: opts.createdById } : {}),
              },
            ],
          },
        }
      : {}),
    receivables: {
      create: rows.map((r) => ({
        organizationId: opts.organizationId,
        clientId: opts.clientId,
        installmentNumber: r.installmentNumber,
        amount: r.amount,
        dueDate: r.dueDate,
        status: r.status,
        paidAt: r.paidAt,
        paymentMethod: r.paymentMethod,
      })),
    },
  }
}

// Monta as linhas de Cost (uma por procedimento). Custo nunca é parcelado.
function buildProcedureCostRows(
  ctx: TenantContext,
  clientId: string,
  date: Date,
  revenueId: string,
  procedures: RevenueProcedureInput[]
) {
  return procedures
    .filter((p) => p.cost > 0)
    .map((p) => ({
      organizationId: ctx.organizationId,
      clientId,
      revenueId,
      type: 'VARIABLE' as const,
      category: PROCEDURE_COST_CATEGORY,
      amount: p.cost,
      date,
      description: p.name,
      isRecurring: false,
      createdById: ctx.userId,
    }))
}

export async function createRevenue(
  ctx: TenantContext,
  clientId: string,
  data: {
    // Competência: `grossAmount` = bruto faturado; `discount` = desconto (R$);
    // `amount` = líquido reconhecido (já calculado pela action). As parcelas são
    // geradas a partir de `amount` + `installments` + `paymentMethod`.
    grossAmount: number
    discount?: number
    amount: number
    type?: RevenueType
    date: Date
    description?: string
    paymentMethod?: string
    installments?: number
    patientId?: string
    procedureId?: string
    procedures?: RevenueProcedureInput[]
  }
) {
  const procedures = data.procedures ?? []
  // procedureId scalar = primeiro procedimento (mantém compat com filtros/relatórios).
  const primaryProcedureId = data.procedureId ?? procedures[0]?.procedureId
  const { rows: receivables, status } = buildReceivables({
    amount: data.amount,
    installments: data.installments,
    date: data.date,
    paymentMethod: data.paymentMethod,
  })

  return scopedTransaction(async (tx) => {
    const revenue = await tx.revenue.create({
      data: {
        organizationId: ctx.organizationId,
        clientId,
        type: data.type ?? 'OUTRA',
        grossAmount: data.grossAmount,
        discount: data.discount ?? 0,
        amount: data.amount,
        status,
        date: data.date,
        description: data.description,
        paymentMethod: data.paymentMethod,
        installments: data.installments ?? 1,
        patientId: data.patientId,
        procedureId: primaryProcedureId,
        createdById: ctx.userId,
        procedures: {
          create: procedures.map((p) => ({
            clientId,
            procedureId: p.procedureId,
            price: p.price,
            cost: p.cost,
          })),
        },
        receivables: {
          create: receivables.map((r) => ({
            organizationId: ctx.organizationId,
            clientId,
            installmentNumber: r.installmentNumber,
            amount: r.amount,
            dueDate: r.dueDate,
            status: r.status,
            paidAt: r.paidAt,
            paymentMethod: r.paymentMethod,
          })),
        },
      },
    })

    const costRows = buildProcedureCostRows(ctx, clientId, data.date, revenue.id, procedures)
    if (costRows.length > 0) {
      await tx.cost.createMany({ data: costRows })
    }

    return revenue
  })
}

export async function createRevenuesBulk(
  ctx: TenantContext,
  clientId: string,
  rows: {
    amount: number
    date: Date
    description?: string
    paymentMethod?: string
    installments?: number
    patientId?: string
    procedureId?: string
  }[]
): Promise<{ count: number }> {
  if (rows.length === 0) return { count: 0 }
  // Import = receita histórica já RECEBIDA: grava QUITADA (bruto = líquido, sem
  // desconto) e gera 1 parcela PAGA por receita p/ o caixa bater. Em transação
  // escopada (RLS). createMany não retorna ids → buscamos as recém-criadas pelo
  // filtro "sem parcela" (o backfill usa o mesmo critério; é self-healing).
  return scopedTransaction(async (tx) => {
    const created = await tx.revenue.createMany({
      data: rows.map((r) => ({
        organizationId: ctx.organizationId,
        clientId,
        type: r.procedureId ? ('PROCEDIMENTO' as const) : ('OUTRA' as const),
        grossAmount: r.amount,
        discount: 0,
        amount: r.amount,
        status: 'QUITADA' as const,
        date: r.date,
        description: r.description,
        paymentMethod: r.paymentMethod,
        installments: r.installments ?? 1,
        patientId: r.patientId,
        procedureId: r.procedureId,
        createdById: ctx.userId,
      })),
    })

    const unbilled = await tx.revenue.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        receivables: { none: {} },
      },
      select: { id: true, amount: true, date: true, paymentMethod: true },
    })
    if (unbilled.length > 0) {
      await tx.receivable.createMany({
        data: unbilled.map((r) => ({
          organizationId: ctx.organizationId,
          clientId,
          revenueId: r.id,
          installmentNumber: 1,
          amount: r.amount,
          dueDate: r.date,
          status: 'PAGO' as const,
          paidAt: r.date,
          paymentMethod: r.paymentMethod,
        })),
      })
    }
    return created
  })
}

// Regenera as parcelas EM ABERTO de uma receita após edição de valor/parcelamento,
// preservando as já PAGAS e as baixadas (PERDIDO) — não reescreve caixa nem perda já
// reconhecidos. O restante (líquido − pago − perdido) é reparcelado nas parcelas que
// sobram, com vencimento mensal a partir da data da receita. Retorna o status da venda
// (QUITADA se nada ficou em aberto). Roda dentro da transação escopada do caller.
async function regenerateReceivables(
  tx: Prisma.TransactionClient,
  opts: {
    revenueId: string
    clientId: string
    organizationId: string
    amount: number
    installments: number
    date: Date
    paymentMethod?: string | null
  }
): Promise<'ABERTA' | 'QUITADA'> {
  const existing = await tx.receivable.findMany({
    where: { revenueId: opts.revenueId, clientId: opts.clientId },
    select: { status: true, amount: true },
  })
  const locked = existing.filter((r) => r.status === 'PAGO' || r.status === 'PERDIDO')
  const lockedSum = locked.reduce((s, r) => s + Number(r.amount), 0)
  const lockedCount = locked.length

  // Remove só as parcelas PENDENTE; PAGO/PERDIDO/CANCELADO ficam intactas.
  await tx.receivable.deleteMany({
    where: { revenueId: opts.revenueId, clientId: opts.clientId, status: 'PENDENTE' },
  })

  const remaining = Math.round((opts.amount - lockedSum) * 100) / 100
  const remainingInstallments =
    remaining > 0.004 ? Math.max(1, (opts.installments || 1) - lockedCount) : 0

  if (remainingInstallments === 0) return 'QUITADA'

  // Sem nenhuma parcela travada = cronograma totalmente novo → reusa buildReceivables
  // (trata 1x à vista como PAGO, igual à criação). Com parcelas travadas, o restante é
  // sempre PENDENTE (não dá p/ "pagar à vista" só uma fração) e continua a numeração.
  if (lockedCount === 0) {
    const { rows, status } = buildReceivables({
      amount: remaining,
      installments: remainingInstallments,
      date: opts.date,
      paymentMethod: opts.paymentMethod ?? undefined,
    })
    await tx.receivable.createMany({
      data: rows.map((r) => ({
        organizationId: opts.organizationId,
        clientId: opts.clientId,
        revenueId: opts.revenueId,
        installmentNumber: r.installmentNumber,
        amount: r.amount,
        dueDate: r.dueDate,
        status: r.status,
        paidAt: r.paidAt,
        paymentMethod: r.paymentMethod,
      })),
    })
    return status
  }

  const parts = splitAmount(remaining, remainingInstallments)
  await tx.receivable.createMany({
    data: parts.map((amt, i) => ({
      organizationId: opts.organizationId,
      clientId: opts.clientId,
      revenueId: opts.revenueId,
      installmentNumber: lockedCount + i + 1,
      amount: amt,
      dueDate: addMonths(opts.date, lockedCount + i),
      status: 'PENDENTE' as const,
      paidAt: null,
      paymentMethod: opts.paymentMethod ?? null,
    })),
  })

  return 'ABERTA'
}

export async function updateRevenue(
  ctx: TenantContext,
  revenueId: string,
  clientId: string,
  data: Partial<{
    grossAmount: number
    discount: number
    amount: number
    type: RevenueType
    date: Date
    description: string
    paymentMethod: string
    installments: number
    patientId: string
    procedureId: string
  }>,
  procedures?: RevenueProcedureInput[]
) {
  // Mudança que afeta o cronograma de parcelas (valor/parcelas/forma/data) dispara a
  // regeneração das parcelas EM ABERTO (preserva pagas/baixadas — ver regenerateReceivables).
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  const scheduleChanged =
    data.amount !== undefined ||
    data.installments !== undefined ||
    data.paymentMethod !== undefined ||
    data.date !== undefined

  // Sem procedimentos nem mudança de cronograma: update escalar simples.
  if (!procedures && !scheduleChanged) {
    return prisma.revenue.updateMany({
      where: { id: revenueId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      data,
    })
  }

  const primaryProcedureId = data.procedureId ?? procedures?.[0]?.procedureId

  return scopedTransaction(async (tx) => {
    const updated = await tx.revenue.updateMany({
      where: { id: revenueId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      data: procedures ? { ...data, procedureId: primaryProcedureId } : data,
    })
    if (updated.count === 0) return updated

    // Com procedimentos: re-sincroniza itens e custos vinculados.
    if (procedures) {
      const date = data.date ?? new Date()
      await tx.revenueProcedure.deleteMany({ where: { revenueId } })
      await tx.cost.updateMany({
        where: { revenueId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      if (procedures.length > 0) {
        await tx.revenueProcedure.createMany({
          data: procedures.map((p) => ({
            clientId,
            revenueId,
            procedureId: p.procedureId,
            price: p.price,
            cost: p.cost,
          })),
        })
        const costRows = buildProcedureCostRows(ctx, clientId, date, revenueId, procedures)
        if (costRows.length > 0) await tx.cost.createMany({ data: costRows })
      }
    }

    // Cronograma: regenera as parcelas em aberto a partir do estado pós-update
    // (não mexe em venda CANCELADA). O status da venda passa a refletir as parcelas.
    if (scheduleChanged) {
      const current = await tx.revenue.findFirst({
        where: { id: revenueId, clientId },
        select: { amount: true, installments: true, date: true, paymentMethod: true, status: true },
      })
      if (current && current.status !== 'CANCELADA') {
        const newStatus = await regenerateReceivables(tx, {
          revenueId,
          clientId,
          organizationId: ctx.organizationId,
          amount: data.amount ?? Number(current.amount),
          installments: data.installments ?? current.installments ?? 1,
          date: data.date ?? current.date,
          paymentMethod: data.paymentMethod ?? current.paymentMethod,
        })
        await tx.revenue.update({ where: { id: revenueId }, data: { status: newStatus } })
      }
    }

    return updated
  })
}

/**
 * Cancela uma venda (competência): status CANCELADA + canceledAt → vira dedução
 * `cancelamentos` no período do cancelamento; as parcelas PENDENTE viram CANCELADO
 * (saem do "a receber"). Belt: clientId no where. Não mexe em parcela já paga.
 */
export async function cancelRevenue(
  ctx: TenantContext,
  revenueId: string,
  clientId: string,
  reason?: string
) {
  const now = new Date()
  return scopedTransaction(async (tx) => {
    const result = await tx.revenue.updateMany({
      where: { id: revenueId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      data: { status: 'CANCELADA', canceledAt: now, cancelReason: reason ?? null },
    })
    if (result.count === 0) return result
    await tx.receivable.updateMany({
      where: { revenueId, clientId, status: 'PENDENTE' },
      data: { status: 'CANCELADO' },
    })
    return result
  })
}

export async function softDeleteRevenue(ctx: TenantContext, revenueId: string, clientId: string) {
  const now = new Date()
  return scopedTransaction(async (tx) => {
    const result = await tx.revenue.updateMany({
      where: { id: revenueId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      data: { deletedAt: now },
    })
    // Soft-delete dos custos de procedimento gerados por esta receita.
    await tx.cost.updateMany({
      where: { revenueId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      data: { deletedAt: now },
    })
    return result
  })
}

export async function getMonthlyRevenueCostData(
  ctx: TenantContext,
  clientId: string,
  months: number = 12
) {
  const now = new Date()
  const { year, month0 } = (() => {
    const k = monthKey(now)
    const [y, m] = k.split('-').map(Number)
    return { year: y, month0: m - 1 }
  })()

  const from = spDate(year, month0 - (months - 1), 1)

  const [revenues, costs] = await Promise.all([
    prisma.revenue.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        status: { not: 'CANCELADA' },
        date: { gte: from },
      },
      select: { amount: true, date: true },
    }),
    prisma.cost.findMany({
      where: { organizationId: ctx.organizationId, clientId, deletedAt: null, date: { gte: from } },
      select: { amount: true, date: true },
    }),
  ])

  const buckets = new Map<string, { revenue: number; costs: number; label: string }>()
  for (let i = months - 1; i >= 0; i--) {
    const firstOfBucket = spDate(year, month0 - i, 1)
    const key = monthKey(firstOfBucket)
    buckets.set(key, { revenue: 0, costs: 0, label: shortMonthLabel(firstOfBucket) })
  }

  for (const r of revenues) {
    const key = monthKey(r.date)
    const bucket = buckets.get(key)
    if (bucket) bucket.revenue += Number(r.amount)
  }
  for (const c of costs) {
    const key = monthKey(c.date)
    const bucket = buckets.get(key)
    if (bucket) bucket.costs += Number(c.amount)
  }

  return Array.from(buckets.values()).map(({ label, revenue, costs }) => ({
    month: label,
    revenue,
    costs,
  }))
}

export async function getTopProceduresByRevenue(
  ctx: TenantContext,
  clientId: string,
  options?: { from?: Date; to?: Date; limit?: number }
) {
  const limit = options?.limit ?? 5
  const grouped = await prisma.revenue.groupBy({
    by: ['procedureId'],
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      status: { not: 'CANCELADA' },
      procedureId: { not: null },
      ...(options?.from || options?.to
        ? {
            date: {
              ...(options?.from ? { gte: options.from } : {}),
              ...(options?.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: limit,
  })

  const ids = grouped.map((g) => g.procedureId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []
  const procedures = await prisma.procedure.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  const map = new Map(procedures.map((p) => [p.id, p.name]))
  return grouped.map((g) => ({
    procedureId: g.procedureId,
    name: g.procedureId ? (map.get(g.procedureId) ?? 'Desconhecido') : 'Sem procedimento',
    total: Number(g._sum.amount ?? 0),
    count: g._count._all,
  }))
}

export async function getTopCostCategories(
  ctx: TenantContext,
  clientId: string,
  options?: { from?: Date; to?: Date; limit?: number }
) {
  const limit = options?.limit ?? 5
  const grouped = await prisma.cost.groupBy({
    by: ['type', 'category'],
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(options?.from || options?.to
        ? {
            date: {
              ...(options?.from ? { gte: options.from } : {}),
              ...(options?.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
  })

  return grouped
    .map((g) => ({
      type: g.type,
      category: g.category,
      label: g.category && g.category.trim().length > 0 ? g.category : g.type,
      total: Number(g._sum.amount ?? 0),
      count: g._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export async function getFinancialSummary(ctx: TenantContext, clientId: string) {
  const now = new Date()
  const [yStr, mStr] = monthKey(now).split('-')
  const year = Number(yStr)
  const month0 = Number(mStr) - 1

  const startOfMonth = spDate(year, month0, 1)
  const startOfLastMonth = spDate(year, month0 - 1, 1)
  const endOfLastMonth = new Date(startOfMonth.getTime() - 1)

  const revTenant = {
    organizationId: ctx.organizationId,
    clientId,
    deletedAt: null,
    status: { not: 'CANCELADA' as const }, // competência: exclui vendas canceladas
  }
  const recvTenant = { organizationId: ctx.organizationId, clientId }

  const [curRevenues, curCosts, prevRevenues, prevCosts, cashReceived, receivableOpen, overdue] =
    await Promise.all([
      prisma.revenue.aggregate({
        where: { ...revTenant, date: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.cost.aggregate({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          date: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      prisma.revenue.aggregate({
        where: { ...revTenant, date: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true },
      }),
      prisma.cost.aggregate({
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          date: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
        _sum: { amount: true },
      }),
      // Bloco de CAIXA: recebido no mês (parcelas pagas por paidAt).
      prisma.receivable.aggregate({
        where: { ...recvTenant, status: 'PAGO', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // A receber (parcelas pendentes, total em aberto).
      prisma.receivable.aggregate({
        where: { ...recvTenant, status: 'PENDENTE' },
        _sum: { amount: true },
      }),
      // Vencido (pendentes com vencimento no passado).
      prisma.receivable.aggregate({
        where: { ...recvTenant, status: 'PENDENTE', dueDate: { lt: now } },
        _sum: { amount: true },
      }),
    ])

  const curRev = Number(curRevenues._sum.amount ?? 0)
  const curCost = Number(curCosts._sum.amount ?? 0)
  const curProfit = curRev - curCost
  const curMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0

  const prevRev = Number(prevRevenues._sum.amount ?? 0)
  const prevCost = Number(prevCosts._sum.amount ?? 0)
  const prevProfit = prevRev - prevCost
  const prevMargin = prevRev > 0 ? (prevProfit / prevRev) * 100 : 0

  return {
    current: {
      revenue: curRev,
      costs: curCost,
      profit: curProfit,
      margin: curMargin,
      count: curRevenues._count,
    },
    previous: { revenue: prevRev, costs: prevCost, profit: prevProfit, margin: prevMargin },
    // Bloco de CAIXA (competência convive com liquidez — ledger dre-progresso.md):
    // recebido no mês, total a receber e o que está vencido.
    cash: {
      received: Number(cashReceived._sum.amount ?? 0),
      receivable: Number(receivableOpen._sum.amount ?? 0),
      overdue: Number(overdue._sum.amount ?? 0),
    },
  }
}
