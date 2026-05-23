import { logger } from '@/lib/logger'

import { findDueActivities, findOverdueActivities } from '@/server/repositories/activity-repository'
import { dispatchNotification } from '@/server/services/notification-service'

type JobTotals = { dueCreated: number; overdueCreated: number; emailed: number; errors: number }

// Roteia a notificação para o domínio correto (§4 / Fase 8). Atividade de
// clínica (`domain === 'CLINIC'`) usa a rota PT da clínica e carrega `clientId`
// — sem ele a notificação não apareceria no sino da clínica, que filtra por
// clientId. Atividade da agência usa a rota admin, sem clientId.
export function domainRouting(a: { domain: string; clientId: string | null }): {
  link: string
  clientId: string | null
} {
  return a.domain === 'CLINIC'
    ? { link: '/atividades', clientId: a.clientId }
    : { link: '/activities', clientId: null }
}

export async function runActivityNotificationsJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { dueCreated: 0, overdueCreated: 0, emailed: 0, errors: 0 }

  try {
    const due = await findDueActivities(now, 24)
    const dueResults = await Promise.allSettled(
      due
        .filter((a) => a.assignedTo)
        .map((a) => {
          const route = domainRouting(a)
          return dispatchNotification(
            [
              {
                userId: a.assignedTo!.id,
                email: a.assignedTo!.email,
                name: a.assignedTo!.name,
                clientId: route.clientId,
              },
            ],
            {
              type: 'ACTIVITY_DUE',
              title: `Tarefa em 24h: ${a.title}`,
              message:
                `A atividade "${a.title}" vence ${formatRelative(a.dueDate!, now)}.` +
                (a.client ? `\nClínica: ${a.client.name}` : ''),
              link: route.link,
              metadata: { activityId: a.id },
              dedupeWindowHours: 18,
            }
          )
        })
    )
    for (const r of dueResults) {
      if (r.status === 'fulfilled') {
        totals.dueCreated += r.value.created
        totals.emailed += r.value.emailed
      } else {
        totals.errors++
        logger.error('activity_due dispatch failed', { reason: String(r.reason) })
      }
    }
  } catch (err) {
    totals.errors++
    logger.error('activity_due batch failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const overdue = await findOverdueActivities(now)
    const overdueResults = await Promise.allSettled(
      overdue
        .filter((a) => a.assignedTo)
        .map((a) => {
          const route = domainRouting(a)
          return dispatchNotification(
            [
              {
                userId: a.assignedTo!.id,
                email: a.assignedTo!.email,
                name: a.assignedTo!.name,
                clientId: route.clientId,
              },
            ],
            {
              type: 'ACTIVITY_OVERDUE',
              title: `Tarefa atrasada: ${a.title}`,
              message:
                `A atividade "${a.title}" venceu ${formatRelative(a.dueDate!, now)}.` +
                (a.client ? `\nClínica: ${a.client.name}` : ''),
              link: route.link,
              metadata: { activityId: a.id },
              dedupeWindowHours: 20,
            }
          )
        })
    )
    for (const r of overdueResults) {
      if (r.status === 'fulfilled') {
        totals.overdueCreated += r.value.created
        totals.emailed += r.value.emailed
      } else {
        totals.errors++
        logger.error('activity_overdue dispatch failed', { reason: String(r.reason) })
      }
    }
  } catch (err) {
    totals.errors++
    logger.error('activity_overdue batch failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  logger.info('Activity notifications job complete', totals)
  return totals
}

function formatRelative(due: Date, now: Date): string {
  const diffMs = due.getTime() - now.getTime()
  const diffH = Math.round(diffMs / 3_600_000)
  if (diffH >= 0) {
    if (diffH === 0) return 'em menos de uma hora'
    if (diffH < 24) return `em ${diffH}h`
    const d = Math.round(diffH / 24)
    return d === 1 ? 'em 1 dia' : `em ${d} dias`
  }
  const absH = Math.abs(diffH)
  if (absH < 24) return `há ${absH}h`
  const d = Math.round(absH / 24)
  return d === 1 ? 'há 1 dia' : `há ${d} dias`
}
