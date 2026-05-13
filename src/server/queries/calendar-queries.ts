import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export type CalendarEvent = {
  id: string
  kind: 'activity' | 'appointment'
  title: string
  start: Date
  end: Date | null
  status: string
  clientName: string | null
  link: string | null
  color: string
  priority?: string
}

const ACTIVITY_COLORS: Record<string, string> = {
  URGENT: '#dc2626',
  HIGH: '#d97706',
  MEDIUM: '#2563eb',
  LOW: '#71717a',
}
const APPT_COLORS: Record<string, string> = {
  SCHEDULED: '#3b82f6',
  CONFIRMED: '#059669',
  ATTENDED: '#16a34a',
  NO_SHOW: '#dc2626',
  CANCELED: '#a1a1aa',
  RESCHEDULED: '#d97706',
}

export async function getUnifiedCalendar(filters: {
  from: Date
  to: Date
  clientId?: string | null
}): Promise<CalendarEvent[]> {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'activities', 'read')

  const isClientRole = ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF'
  const targetClientId = isClientRole ? ctx.clientId : (filters.clientId ?? undefined)

  const events: CalendarEvent[] = []

  // Atividades — janela por dueDate.
  const activities = await prisma.activity.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      dueDate: { gte: filters.from, lte: filters.to },
      ...(targetClientId ? { clientId: targetClientId } : {}),
    },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      dueDate: true,
      client: { select: { name: true } },
    },
    take: 500,
  })

  for (const a of activities) {
    if (!a.dueDate) continue
    events.push({
      id: `activity-${a.id}`,
      kind: 'activity',
      title: `${a.title}`,
      start: a.dueDate,
      end: null,
      status: a.status,
      clientName: a.client?.name ?? null,
      link: '/activities',
      color: ACTIVITY_COLORS[a.priority] ?? '#71717a',
      priority: a.priority,
    })
  }

  // Agendamentos — janela por scheduledAt.
  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      scheduledAt: { gte: filters.from, lte: filters.to },
      ...(targetClientId ? { clientId: targetClientId } : {}),
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      clientId: true,
      patient: { select: { name: true } },
      procedure: { select: { name: true } },
      client: { select: { name: true } },
    },
    take: 500,
  })

  for (const a of appointments) {
    const start = a.scheduledAt
    const end = new Date(start.getTime() + a.durationMinutes * 60_000)
    events.push({
      id: `appointment-${a.id}`,
      kind: 'appointment',
      title: `${a.patient.name} — ${a.procedure.name}`,
      start,
      end,
      status: a.status,
      clientName: a.client.name,
      link: isClientRole ? '/appointments' : `/clients/${a.clientId}/appointments`,
      color: APPT_COLORS[a.status] ?? '#3b82f6',
    })
  }

  return events
}
