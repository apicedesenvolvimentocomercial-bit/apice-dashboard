import { logger } from '@/lib/logger'

import { findDueActivities, findOverdueActivities } from '@/server/repositories/activity-repository'
import { dispatchNotification } from '@/server/services/notification-service'

type JobTotals = { dueCreated: number; overdueCreated: number; emailed: number; errors: number }

export async function runActivityNotificationsJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { dueCreated: 0, overdueCreated: 0, emailed: 0, errors: 0 }

  try {
    const due = await findDueActivities(now, 24)
    for (const a of due) {
      if (!a.assignedTo) continue
      const r = await dispatchNotification(
        [{ userId: a.assignedTo.id, email: a.assignedTo.email, name: a.assignedTo.name }],
        {
          type: 'ACTIVITY_DUE',
          title: `Tarefa em 24h: ${a.title}`,
          message:
            `A atividade "${a.title}" vence ${formatRelative(a.dueDate!, now)}.` +
            (a.client ? `\nClínica: ${a.client.name}` : ''),
          link: '/activities',
          metadata: { activityId: a.id },
          dedupeWindowHours: 18,
        }
      )
      totals.dueCreated += r.created
      totals.emailed += r.emailed
    }
  } catch (err) {
    totals.errors++
    logger.error('activity_due dispatch failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const overdue = await findOverdueActivities(now)
    for (const a of overdue) {
      if (!a.assignedTo) continue
      const r = await dispatchNotification(
        [{ userId: a.assignedTo.id, email: a.assignedTo.email, name: a.assignedTo.name }],
        {
          type: 'ACTIVITY_OVERDUE',
          title: `Tarefa atrasada: ${a.title}`,
          message:
            `A atividade "${a.title}" venceu ${formatRelative(a.dueDate!, now)}.` +
            (a.client ? `\nClínica: ${a.client.name}` : ''),
          link: '/activities',
          metadata: { activityId: a.id },
          dedupeWindowHours: 20,
        }
      )
      totals.overdueCreated += r.created
      totals.emailed += r.emailed
    }
  } catch (err) {
    totals.errors++
    logger.error('activity_overdue dispatch failed', {
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
