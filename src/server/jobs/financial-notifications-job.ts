import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  dispatchNotification,
  getRecipientsForModule,
} from '@/server/services/notification-service'

/**
 * Cron diário FINANCEIRO — PARCELAS VENCIDAS. Conta `Receivable` PENDENTE com
 * `dueDate` no passado (de Revenue viva) e manda UM aviso agregado por clínica
 * p/ titular + cargo com `financial:read`.
 *
 * Type SYSTEM com `category: 'financial'` (filtrável nas preferências do
 * cargo). Dedupe 20h ⇒ no máximo 1 lembrete/dia enquanto houver vencida.
 */

type JobTotals = { clinicsNotified: number; errors: number }

export async function runFinancialNotificationsJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { clinicsNotified: 0, errors: 0 }

  const overdue = await prisma.receivable.groupBy({
    by: ['clientId'],
    where: {
      status: 'PENDENTE',
      dueDate: { lt: now },
      revenue: { deletedAt: null, status: { not: 'CANCELADA' } },
    },
    _count: { _all: true },
    _sum: { amount: true },
  })
  if (overdue.length === 0) return totals

  const clients = await prisma.client.findMany({
    where: { id: { in: overdue.map((o) => o.clientId) }, deletedAt: null },
    select: { id: true, organizationId: true },
  })
  const orgByClient = new Map(clients.map((c) => [c.id, c.organizationId]))

  for (const row of overdue) {
    try {
      const organizationId = orgByClient.get(row.clientId)
      if (!organizationId) continue // clínica soft-deletada

      const targets = await getRecipientsForModule(organizationId, row.clientId, 'financial')
      if (targets.length === 0) continue

      const count = row._count._all
      const total = Number(row._sum.amount ?? 0)
      const totalFmt = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

      const r = await dispatchNotification(targets, {
        type: 'SYSTEM',
        category: 'financial',
        title: count === 1 ? '1 parcela vencida em aberto' : `${count} parcelas vencidas em aberto`,
        message: `Total vencido: ${totalFmt}. Confira o contas a receber e dê baixa ou cobre.`,
        link: '/financial',
        metadata: { count, total },
        dedupeWindowHours: 20,
      })
      if (r.created > 0) totals.clinicsNotified++
    } catch (err) {
      totals.errors++
      logger.error('overdue-receivable notification failed', {
        clientId: row.clientId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('Financial notifications job complete', totals)
  return totals
}
