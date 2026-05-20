import { listCalendarEvents } from '@/server/repositories/calendar-event-repository'
import { listOrgHolidays } from '@/server/repositories/org-holiday-repository'
import { getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export type CalendarEvent = {
  id: string
  kind: 'event' | 'holiday'
  title: string
  start: Date
  end: Date | null
  color: string
  link: string | null
  // Source data — para drawer/edit.
  notes: string | null
  category: string | null
  activityId: string | null
}

export type CalendarHoliday = {
  id: string
  date: string
  name: string
}

const DEFAULT_EVENT_COLOR = '#3b82f6'
const HOLIDAY_COLOR = '#e2e8f0'

// Carrega eventos do calendário pessoal do usuário atual + feriados da org.
// Calendário é por-usuário: admin não enxerga calendário de staff e
// vice-versa. Feriados são compartilhados na organização.
export async function getUserCalendar(filters: {
  from: Date
  to: Date
}): Promise<{ events: CalendarEvent[]; holidays: CalendarHoliday[] }> {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'activities', 'read')

  // Janela de feriados em string YYYY-MM-DD (OrgHoliday.date é string).
  const fromStr = filters.from.toISOString().slice(0, 10)
  const toStr = filters.to.toISOString().slice(0, 10)

  const [rows, holidays] = await Promise.all([
    listCalendarEvents(ctx, { from: filters.from, to: filters.to, userId: ctx.userId }),
    listOrgHolidays(ctx, { from: fromStr, to: toStr }),
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
  }))

  // Feriados entram como eventos de fundo no inner (display: 'background').
  // Mantemos numa lista separada para permitir estilização específica.
  return {
    events,
    holidays: holidays.map((h) => ({ id: h.id, date: h.date, name: h.name })),
  }
}

// Re-export do tipo só para evitar churn em quem ainda referencia o nome
// antigo durante refactor. Pode ser removido depois de migrar callers.
export { HOLIDAY_COLOR }
