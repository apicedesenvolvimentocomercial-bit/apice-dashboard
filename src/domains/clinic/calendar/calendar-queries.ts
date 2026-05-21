import { getClinicContext } from '@/server/auth/clinic-context'

import { listClinicCalendarEvents } from './calendar-event-repository'

/**
 * Leitura do Calendário do DOMÍNIO CLÍNICA (Fase 4). Escopo `clientId` +
 * `userId` garantido pelo `ClinicContext`. Sem feriados por ora — a decisão
 * "clínica vê OrgHoliday ou tem os próprios" está pendente (Fase 4 do prompt).
 */

export type ClinicCalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date | null
  color: string | null
  notes: string | null
  category: string | null
  activityId: string | null
}

export async function getClinicCalendar(filters: {
  from: Date
  to: Date
}): Promise<{ events: ClinicCalendarEvent[] }> {
  const ctx = await getClinicContext()

  const rows = await listClinicCalendarEvents(ctx, {
    from: filters.from,
    to: filters.to,
    userId: ctx.userId,
  })

  return {
    events: rows.map((r) => ({
      id: r.id,
      title: r.title,
      start: r.startAt,
      end: r.endAt,
      color: r.color,
      notes: r.notes,
      category: r.category,
      activityId: r.activityId,
    })),
  }
}
