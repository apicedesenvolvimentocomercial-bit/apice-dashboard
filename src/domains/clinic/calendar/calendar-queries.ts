import { prisma } from '@/lib/prisma'
import { getClinicContext } from '@/server/auth/clinic-context'
import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

import { listClinicCalendarEvents } from './calendar-event-repository'

/**
 * Leitura do Calendário do DOMÍNIO CLÍNICA (Fase 4). Escopo `clientId` +
 * `userId` garantido pelo `ClinicContext`. Devolve no MESMO formato do admin
 * (`CalendarEvent`/`CalendarHoliday`) para reusar o render puro `CalendarInner`
 * (FullCalendar). Feriados vêm de `ClinicHoliday` (por clínica) — NÃO de
 * `OrgHoliday` (agência). Decisão de produto: clínica tem feriados próprios.
 */

const DEFAULT_EVENT_COLOR = '#3b82f6'

export async function getClinicCalendar(filters: {
  from: Date
  to: Date
}): Promise<{ events: CalendarEvent[]; holidays: CalendarHoliday[] }> {
  const ctx = await getClinicContext()

  const fromStr = filters.from.toISOString().slice(0, 10)
  const toStr = filters.to.toISOString().slice(0, 10)

  const [rows, holidays] = await Promise.all([
    listClinicCalendarEvents(ctx, { from: filters.from, to: filters.to, userId: ctx.userId }),
    // ClinicHoliday é por clínica (clientId). Date é string "YYYY-MM-DD".
    prisma.clinicHoliday.findMany({
      where: { clientId: ctx.clientId, date: { gte: fromStr, lte: toStr } },
      select: { id: true, date: true, name: true },
      orderBy: { date: 'asc' },
    }),
  ])

  const events: CalendarEvent[] = rows.map((r) => ({
    id: r.id,
    kind: 'event',
    title: r.title,
    start: r.startAt,
    end: r.endAt,
    color: r.color ?? DEFAULT_EVENT_COLOR,
    link: null,
    notes: r.notes,
    category: r.category,
    activityId: r.activityId,
    recurrenceGroupId: r.recurrenceGroupId,
  }))

  return {
    events,
    holidays: holidays.map((h) => ({ id: h.id, date: h.date, name: h.name })),
  }
}
