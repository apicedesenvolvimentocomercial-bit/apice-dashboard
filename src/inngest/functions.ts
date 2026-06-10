import { cron, eventType } from 'inngest'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { runInsightsJob } from '@/server/jobs/insights-job'
import { runMessagesJob } from '@/server/jobs/messages-job'
import { runActivityNotificationsJob } from '@/server/jobs/notifications-job'
import { runRecurringCostsJob } from '@/server/jobs/recurring-costs-job'
import { runReportsJob } from '@/server/jobs/reports-job'
import { listRetentionClients, runRetentionForClientId } from '@/server/jobs/retention-job'
import { runSessionCleanupJob } from '@/server/jobs/session-cleanup-job'
import { runSnapshotsJob } from '@/server/jobs/snapshots-job'

import { inngest } from './client'

/**
 * Funções agendadas do Inngest (decisão Q1) — espelham os horários que viviam
 * no vercel.json, no fuso de SP. Throw dentro da função → o Inngest re-tenta
 * (default) e o dashboard alerta — é o monitoramento de cron (G1) sem custo.
 *
 * Retenção usa FAN-OUT (D2): o scan diário emite 1 evento por clínica e cada
 * clínica roda na PRÓPRIA invocação — falha/lentidão de uma não afeta as outras
 * e o limite de duração por função deixa de escalar com o nº de clínicas.
 */

const TZ = 'TZ=America/Sao_Paulo'

/** Evento tipado do fan-out de retenção (1 por clínica, emitido pelo scan). */
export const retentionClinicDue = eventType('retention/clinic.due', {
  schema: z.object({ clientId: z.string() }),
})

export const sessionCleanup = inngest.createFunction(
  { id: 'session-cleanup', triggers: [cron(`${TZ} 0 2 * * *`)] },
  async () => runSessionCleanupJob()
)

export const snapshots = inngest.createFunction(
  { id: 'kpi-snapshots', triggers: [cron(`${TZ} 0 3 * * *`)] },
  async () => runSnapshotsJob()
)

export const recurringCosts = inngest.createFunction(
  { id: 'recurring-costs', triggers: [cron(`${TZ} 0 4 * * *`)] },
  async () => runRecurringCostsJob()
)

export const insights = inngest.createFunction(
  { id: 'insights', triggers: [cron(`${TZ} 0 5 * * *`)] },
  async () => runInsightsJob()
)

export const monthlyReports = inngest.createFunction(
  { id: 'monthly-reports', triggers: [cron(`${TZ} 0 6 1 * *`)] },
  async () => runReportsJob()
)

export const notifications = inngest.createFunction(
  { id: 'activity-notifications', triggers: [cron(`${TZ} 0 8 * * *`)] },
  async () => runActivityNotificationsJob()
)

/** Scan diário da retenção: emite 1 evento por clínica (fan-out). */
export const retentionScan = inngest.createFunction(
  { id: 'retention-scan', triggers: [cron(`${TZ} 0 7 * * *`)] },
  async ({ step }) => {
    const clients = await step.run('list-clinics', async () => {
      const rows = await listRetentionClients()
      return rows.map((c) => ({ id: c.id }))
    })
    if (clients.length > 0) {
      await step.sendEvent(
        'fan-out',
        clients.map((c) => retentionClinicDue.create({ clientId: c.id }))
      )
    }
    logger.info('Retention scan dispatched', { clinics: clients.length })
    return { clinics: clients.length }
  }
)

/** Régua de retenção de UMA clínica (invocação própria; ≤5 em paralelo). */
export const retentionClinic = inngest.createFunction(
  { id: 'retention-clinic', triggers: [retentionClinicDue], concurrency: { limit: 5 } },
  async ({ event }) => {
    const result = await runRetentionForClientId(event.data.clientId)
    return result ?? { skipped: 'clinic-not-found' }
  }
)

/**
 * Dispatcher da fila de mensagens a cada 15 min (antes: 1×/dia). O claim
 * atômico no job torna sobreposição inofensiva.
 */
export const messagesDispatch = inngest.createFunction(
  { id: 'messages-dispatch', triggers: [cron('*/15 * * * *')] },
  async () => runMessagesJob()
)

export const functions = [
  sessionCleanup,
  snapshots,
  recurringCosts,
  insights,
  monthlyReports,
  notifications,
  retentionScan,
  retentionClinic,
  messagesDispatch,
]
