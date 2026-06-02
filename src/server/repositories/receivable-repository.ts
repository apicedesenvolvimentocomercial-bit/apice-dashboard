import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

export type ReceivableRow = Awaited<ReturnType<typeof listReceivables>>[number]

/**
 * Contas a receber (parcelas) de uma clínica. Sempre escopado por `clientId` (belt)
 * + RLS (a action entra escopo). Ver ledger dre-progresso.md.
 */
export async function listReceivables(
  ctx: TenantContext,
  clientId: string,
  filters?: { status?: 'PENDENTE' | 'PAGO' | 'PERDIDO' | 'CANCELADO' }
) {
  const rows = await prisma.receivable.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: [{ dueDate: 'asc' }],
    take: 500,
    select: {
      id: true,
      installmentNumber: true,
      amount: true,
      dueDate: true,
      status: true,
      paidAt: true,
      paymentMethod: true,
      revenue: {
        select: {
          id: true,
          description: true,
          installments: true,
          patient: { select: { name: true } },
        },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    installmentNumber: r.installmentNumber,
    totalInstallments: r.revenue.installments ?? 1,
    amount: Number(r.amount),
    dueDate: r.dueDate,
    status: r.status,
    paidAt: r.paidAt,
    paymentMethod: r.paymentMethod,
    label: r.revenue.patient?.name ?? r.revenue.description ?? 'Receita',
  }))
}

// Recalcula o status da venda após uma parcela mudar: QUITADA quando não há mais
// parcela PENDENTE; ABERTA caso contrário. Nunca mexe numa venda CANCELADA.
async function syncRevenueStatus(tx: Prisma.TransactionClient, revenueId: string) {
  const revenue = await tx.revenue.findUnique({
    where: { id: revenueId },
    select: { status: true, receivables: { select: { status: true } } },
  })
  if (!revenue || revenue.status === 'CANCELADA') return
  const active = revenue.receivables.filter((r) => r.status !== 'CANCELADO')
  const anyPending = active.some((r) => r.status === 'PENDENTE')
  await tx.revenue.update({
    where: { id: revenueId },
    data: { status: anyPending ? 'ABERTA' : 'QUITADA' },
  })
}

async function setReceivableStatus(
  ctx: TenantContext,
  clientId: string,
  receivableId: string,
  data: { status: 'PAGO' | 'PERDIDO' | 'PENDENTE'; paidAt: Date | null; paymentMethod?: string }
): Promise<{ count: number }> {
  return scopedTransaction(async (tx) => {
    // Belt: clientId no where isola entre clínicas da mesma org.
    const updated = await tx.receivable.updateMany({
      where: { id: receivableId, clientId, organizationId: ctx.organizationId },
      data: {
        status: data.status,
        paidAt: data.paidAt,
        // Data dedicada da baixa por perda: setada ao virar PERDIDO, limpa ao
        // reverter (PAGO/PENDENTE). A DRE atribui a inadimplência por este campo.
        writtenOffAt: data.status === 'PERDIDO' ? new Date() : null,
        ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
      },
    })
    if (updated.count === 0) return updated
    const row = await tx.receivable.findFirst({
      where: { id: receivableId, clientId },
      select: { revenueId: true },
    })
    if (row) await syncRevenueStatus(tx, row.revenueId)
    return updated
  })
}

export function markReceivablePaid(
  ctx: TenantContext,
  clientId: string,
  receivableId: string,
  paidAt: Date,
  paymentMethod?: string
) {
  return setReceivableStatus(ctx, clientId, receivableId, { status: 'PAGO', paidAt, paymentMethod })
}

/** Baixa por perda (write-off) → inadimplência na DRE. */
export function markReceivableLost(ctx: TenantContext, clientId: string, receivableId: string) {
  return setReceivableStatus(ctx, clientId, receivableId, { status: 'PERDIDO', paidAt: null })
}

/** Reverte para PENDENTE (desfaz pago/perdido). */
export function markReceivablePending(ctx: TenantContext, clientId: string, receivableId: string) {
  return setReceivableStatus(ctx, clientId, receivableId, { status: 'PENDENTE', paidAt: null })
}
