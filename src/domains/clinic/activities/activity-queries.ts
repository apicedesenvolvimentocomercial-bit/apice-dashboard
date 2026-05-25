import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { can } from '@/server/auth/permissions'
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

  // Visibilidade (Etapa 3 / lacuna 3): titular OU quem tem activities:viewAll
  // vê as atividades de todos; os demais veem só as próprias. Quando o viewer
  // não pode ver tudo, o filtro de responsável é FORÇADO ao próprio usuário,
  // ignorando qualquer assignedToId vindo de input (defesa server-side).
  const canViewAll = ctx.isOwner || (await can(ctx.userId, ctx.role, 'activities', 'viewAll'))
  const canAssignOthers =
    ctx.isOwner || (await can(ctx.userId, ctx.role, 'activities', 'assignToOthers'))
  const assignedToId = canViewAll ? filters.assignedToId : ctx.userId

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
  // Sem permissão de delegar, o seletor de responsável some: a UI só enxerga o
  // próprio usuário (a action também força isso, defesa em profundidade).
  const visibleMembers = canAssignOthers ? members : members.filter((m) => m.id === ctx.userId)
  return {
    rows,
    counts,
    members: visibleMembers,
    currentUserId: ctx.userId,
    role: ctx.role,
    canViewAll,
    canAssignOthers,
    syncPref: prefRow?.activityCalendarSync ?? 'ASK',
  }
}
