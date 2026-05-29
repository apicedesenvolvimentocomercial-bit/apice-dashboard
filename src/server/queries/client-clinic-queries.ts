import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import type { CalendarEvent, CalendarHoliday } from '@/server/queries/calendar-queries'

/**
 * Janela READ-ONLY do ADMIN sobre os dados OPERACIONAIS da clínica
 * (atividades + calendário pessoal), acessível só em `clients/[clientId]`
 * (reforma divisão total). O admin NÃO opera essas ferramentas — só visualiza
 * o que é da clínica X, e somente aqui. Usa `getTenantContext` +
 * `assertClientAccess` (garante que a clínica é da org do admin).
 *
 * Diferente do domínio clínica (que usa `ClinicContext` e força o clientId da
 * sessão), aqui o admin escolhe o clientId — por isso o filtro é explícito
 * (`clientId` do param) + `domain: 'CLINIC'` para nunca trazer atividade da
 * própria agência.
 */

const DEFAULT_EVENT_COLOR = '#3b82f6'

export async function getClientClinicActivities(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS (admin vendo UMA clínica)
  await assertCan(ctx, 'activities', 'read')

  return prisma.activity.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      domain: 'CLINIC',
      deletedAt: null,
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      assignedTo: { select: { id: true, name: true, image: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })
}

export async function getClientClinicCalendar(
  clientId: string,
  filters: { from: Date; to: Date }
): Promise<{ events: CalendarEvent[]; holidays: CalendarHoliday[] }> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS (admin vendo UMA clínica)
  await assertCan(ctx, 'activities', 'read')

  const fromStr = filters.from.toISOString().slice(0, 10)
  const toStr = filters.to.toISOString().slice(0, 10)

  // Admin vê o calendário INTEIRO da clínica (todos os usuários dela), não só
  // o de um usuário — escopo por clientId. Eventos de agência (clientId null)
  // nunca entram.
  const [rows, holidays] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        startAt: { gte: filters.from, lte: filters.to },
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        color: true,
        notes: true,
        category: true,
        activityId: true,
      },
    }),
    prisma.clinicHoliday.findMany({
      where: { clientId, date: { gte: fromStr, lte: toStr } },
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
  }))

  return { events, holidays: holidays.map((h) => ({ id: h.id, date: h.date, name: h.name })) }
}
