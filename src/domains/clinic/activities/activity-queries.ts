import { getClinicContext } from '@/server/auth/clinic-context'

import {
  countClinicActivities,
  listClinicActivities,
  type ClinicActivityListFilters,
} from './activity-repository'

/**
 * Leitura de Atividades do DOMÍNIO CLÍNICA (Fase 3). Escopo `clientId`
 * garantido pelo `ClinicContext` no repo — esta camada só orquestra a lista +
 * contadores das abas.
 */

export type ClinicActivityCounts = {
  today: number
  week: number
  overdue: number
  all: number
  done: number
}

export async function getClinicActivities(
  filters: { view?: ClinicActivityListFilters['view']; assignedToId?: string } = {}
) {
  const ctx = await getClinicContext()

  const [rows, today, week, overdue, all, done] = await Promise.all([
    listClinicActivities(ctx, {
      view: filters.view ?? 'today',
      assignedToId: filters.assignedToId,
    }),
    countClinicActivities(ctx, { view: 'today', assignedToId: filters.assignedToId }),
    countClinicActivities(ctx, { view: 'week', assignedToId: filters.assignedToId }),
    countClinicActivities(ctx, { view: 'overdue', assignedToId: filters.assignedToId }),
    countClinicActivities(ctx, { view: 'all', assignedToId: filters.assignedToId }),
    countClinicActivities(ctx, { view: 'done', assignedToId: filters.assignedToId }),
  ])

  const counts: ClinicActivityCounts = { today, week, overdue, all, done }
  return { rows, counts }
}
