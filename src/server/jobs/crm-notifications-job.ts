import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  dispatchNotification,
  getRecipientsForModule,
  type DispatchTarget,
} from '@/server/services/notification-service'

/**
 * Cron diário de CRM — LEAD PARADO. Um lead comercial sem nenhum toque há
 * `STALE_LEAD_DAYS`+ (proxy: `updatedAt` — qualquer movimento de etapa, edição
 * ou interação atualiza a linha) em etapa não-terminal gera aviso:
 *
 * - Com responsável (`assignedToId`) → 1 aviso agregado PARA O responsável
 *   ("você tem N leads parados").
 * - Sem responsável → 1 aviso agregado p/ titular + cargo com `crm:read`.
 *
 * Type SYSTEM com `category: 'crm'` (filtrável nas preferências do cargo).
 * Dedupe 20h ⇒ no máximo 1 aviso/dia por pessoa enquanto houver lead parado.
 * Só pipeline COMERCIAL: retenção é posicionada pelo cron (parado é o normal).
 */

export const STALE_LEAD_DAYS = 7
const MAX_NAMES = 3
const DAY_MS = 24 * 60 * 60 * 1000

type JobTotals = { assignedNotified: number; unassignedNotified: number; errors: number }

export async function runCrmNotificationsJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { assignedNotified: 0, unassignedNotified: 0, errors: 0 }
  const staleBefore = new Date(now.getTime() - STALE_LEAD_DAYS * DAY_MS)

  const stale = await prisma.lead.findMany({
    where: {
      deletedAt: null,
      updatedAt: { lt: staleBefore },
      stage: { isWon: false, isLost: false, pipeline: { kind: 'COMMERCIAL' } },
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      organizationId: true,
      assignedToId: true,
      stage: { select: { name: true } },
    },
  })
  if (stale.length === 0) return totals

  // Agrupa por clínica → por responsável (null = sem dono).
  const byClinic = new Map<string, typeof stale>()
  for (const l of stale) {
    const list = byClinic.get(l.clientId) ?? []
    list.push(l)
    byClinic.set(l.clientId, list)
  }

  for (const [clientId, leads] of byClinic) {
    try {
      const organizationId = leads[0].organizationId
      const byAssignee = new Map<string | null, typeof leads>()
      for (const l of leads) {
        const key = l.assignedToId ?? null
        const list = byAssignee.get(key) ?? []
        list.push(l)
        byAssignee.set(key, list)
      }

      const assigneeIds = [...byAssignee.keys()].filter((k): k is string => k !== null)
      const users = assigneeIds.length
        ? await prisma.user.findMany({
            where: { id: { in: assigneeIds }, isActive: true, deletedAt: null },
            select: { id: true, email: true, name: true, clientId: true },
          })
        : []
      const userById = new Map(users.map((u) => [u.id, u]))

      for (const [assigneeId, group] of byAssignee) {
        const names = group
          .slice(0, MAX_NAMES)
          .map((l) => `${l.name} (${l.stage.name})`)
          .join(', ')
        const rest = group.length - MAX_NAMES
        const tail = rest > 0 ? ` e mais ${rest}` : ''

        if (assigneeId) {
          const u = userById.get(assigneeId)
          if (!u) continue
          const r = await dispatchNotification(
            [{ userId: u.id, email: u.email, name: u.name, clientId: u.clientId }],
            {
              type: 'SYSTEM',
              category: 'crm',
              title:
                group.length === 1
                  ? 'Lead parado há mais de 7 dias'
                  : `${group.length} leads parados há mais de 7 dias`,
              message: `Sem movimento: ${names}${tail}. Vale um toque antes de esfriar de vez.`,
              link: '/crm?stale=mine',
              metadata: { count: group.length, leadIds: group.map((l) => l.id).slice(0, 20) },
              dedupeWindowHours: 20,
            }
          )
          totals.assignedNotified += r.created
        } else {
          const targets: DispatchTarget[] = await getRecipientsForModule(
            organizationId,
            clientId,
            'crm'
          )
          if (targets.length === 0) continue
          const r = await dispatchNotification(targets, {
            type: 'SYSTEM',
            category: 'crm',
            title:
              group.length === 1
                ? 'Lead sem responsável parado há mais de 7 dias'
                : `${group.length} leads sem responsável parados há mais de 7 dias`,
            message: `Sem movimento e sem dono: ${names}${tail}. Atribua um responsável.`,
            link: '/crm?stale=unassigned',
            metadata: { count: group.length, leadIds: group.map((l) => l.id).slice(0, 20) },
            dedupeWindowHours: 20,
          })
          totals.unassignedNotified += r.created
        }
      }
    } catch (err) {
      totals.errors++
      logger.error('stale-lead notification failed for clinic', {
        clientId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('CRM notifications job complete', totals)
  return totals
}
