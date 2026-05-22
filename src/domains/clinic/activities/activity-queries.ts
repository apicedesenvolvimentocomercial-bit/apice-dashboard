import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { getClinicContext } from '@/server/auth/clinic-context'

import {
  countClinicActivities,
  listClinicActivities,
  listClinicMembers,
  type ClinicActivityListFilters,
} from './activity-repository'

/**
 * Leitura de Atividades do DOMÍNIO CLÍNICA (Fase 3). Escopo `clientId` +
 * `domain=CLINIC` garantido pelo repo. Esta camada orquestra lista + contadores
 * + membros da clínica (pastas/seletor de responsável) numa única passada.
 */

export type ClinicActivityCounts = {
  today: number
  week: number
  overdue: number
  all: number
  done: number
}

export async function getClinicActivitiesPage(
  filters: { view?: ClinicActivityListFilters['view']; assignedToId?: string } = {}
) {
  const ctx = await getClinicContext()
  // Gate de leitura intra-clínica (Fase 6). OWNER e STAFF têm read por padrão;
  // override em UserPermission pode revogar. Defesa em profundidade junto do
  // escopo clientId+domain do repo.
  await assertCan(ctx, 'activities', 'read')
  const assignedToId = filters.assignedToId

  const [rows, today, week, overdue, all, done, members, prefRow] = await Promise.all([
    listClinicActivities(ctx, { view: filters.view ?? 'today', assignedToId }),
    countClinicActivities(ctx, { view: 'today', assignedToId }),
    countClinicActivities(ctx, { view: 'week', assignedToId }),
    countClinicActivities(ctx, { view: 'overdue', assignedToId }),
    countClinicActivities(ctx, { view: 'all', assignedToId }),
    countClinicActivities(ctx, { view: 'done', assignedToId }),
    listClinicMembers(ctx),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { activityCalendarSync: true },
    }),
  ])

  const counts: ClinicActivityCounts = { today, week, overdue, all, done }
  return {
    rows,
    counts,
    members,
    currentUserId: ctx.userId,
    role: ctx.role,
    syncPref: prefRow?.activityCalendarSync ?? 'ASK',
  }
}
