import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Testes de isolamento cross-tenant (reforma divisão total, Fase 8 / §4).
 *
 * Prova a "regra de ouro" (§3.4): TODA função de acesso a dado operacional de
 * clínica injeta `where.clientId = ctx.clientId` (ou `data.clientId`) — nunca
 * de input — então um CLIENT_* da clínica A não consegue tocar dado da clínica
 * B nem da agência. Aqui o `prisma` é mockado: inspecionamos o `where`/`data`
 * que cada repo monta. Não precisa de DB (o ambiente é prod; ver ledger).
 */

vi.mock('@/lib/prisma', () => {
  const model = () => ({
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    count: vi.fn(async () => 0),
    create: vi.fn(async () => ({ id: 'created' })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  })
  return {
    prisma: {
      activity: model(),
      calendarEvent: model(),
      notification: model(),
      user: model(),
    },
  }
})

import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'
import * as act from '@/domains/clinic/activities/activity-repository'
import * as notif from '@/domains/clinic/notifications/notification-repository'
import * as cal from '@/domains/clinic/calendar/calendar-event-repository'

// Contexto de clínica A. O `clientId` é a fronteira de isolamento.
const ctxA: ClinicContext = {
  userId: 'user-A',
  organizationId: 'org-1',
  role: 'CLIENT_OWNER',
  clientId: 'clinic-A',
}
const OTHER = 'clinic-B' // clínica vizinha — NUNCA deve aparecer num where.

type Args = { where?: Record<string, unknown>; data?: Record<string, unknown> }

function lastArg(fn: unknown): Args {
  const { calls } = (fn as { mock: { calls: unknown[][] } }).mock
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0] as Args
}

const p = prisma as unknown as {
  activity: Record<string, unknown>
  calendarEvent: Record<string, unknown>
  notification: Record<string, unknown>
  user: Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Atividades da clínica — escopo clientId+domain forçado', () => {
  it('listClinicActivities força clientId, domain CLINIC e organizationId', async () => {
    await act.listClinicActivities(ctxA, { view: 'all' })
    const w = lastArg(p.activity.findMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.domain).toBe('CLINIC')
    expect(w.organizationId).toBe('org-1')
  })

  it('countClinicActivities força clientId mesmo com filtros', async () => {
    await act.countClinicActivities(ctxA, { view: 'overdue', assignedToId: 'user-A' })
    expect(lastArg(p.activity.count).where!.clientId).toBe('clinic-A')
  })

  it('findClinicActivityById escopa por clientId+domain (id sozinho não basta)', async () => {
    await act.findClinicActivityById(ctxA, 'act-from-other-clinic')
    const w = lastArg(p.activity.findFirst).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.domain).toBe('CLINIC')
    expect(w.id).toBe('act-from-other-clinic')
  })

  it('createClinicActivity grava clientId da sessão e domain CLINIC', async () => {
    await act.createClinicActivity(ctxA, { title: 'x', type: 'TASK' })
    const d = lastArg(p.activity.create).data!
    expect(d.clientId).toBe('clinic-A')
    expect(d.domain).toBe('CLINIC')
    expect(d.organizationId).toBe('org-1')
  })

  it('updateClinicActivity só atinge atividade da própria clínica', async () => {
    await act.updateClinicActivity(ctxA, 'act-1', { title: 'y' })
    const w = lastArg(p.activity.updateMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.domain).toBe('CLINIC')
  })

  it('softDeleteClinicActivity escopa por clientId', async () => {
    await act.softDeleteClinicActivity(ctxA, 'act-1')
    expect(lastArg(p.activity.updateMany).where!.clientId).toBe('clinic-A')
  })

  it('markClinicActivitiesSeen escopa por clientId e pelo próprio userId', async () => {
    await act.markClinicActivitiesSeen(ctxA, ['act-1'])
    const w = lastArg(p.activity.updateMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.assignedToId).toBe('user-A')
  })

  it('resolveClinicAssignee só busca membros da MESMA clínica; cai no próprio se não achar', async () => {
    // prisma.user.findFirst mockado devolve null (alvo não é da clínica A).
    const result = await act.resolveClinicAssignee(ctxA, 'user-from-clinic-B')
    expect(lastArg(p.user.findFirst).where!.clientId).toBe('clinic-A')
    expect(result).toBe('user-A') // fallback — nunca atribui cross-clínica
  })

  it('resolveClinicAssignee devolve o próprio sem consultar quando requested === userId', async () => {
    const result = await act.resolveClinicAssignee(ctxA, 'user-A')
    expect(result).toBe('user-A')
    expect((p.user.findFirst as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(0)
  })

  it('listClinicBroadcastTargets e listClinicMembers varrem só a própria clínica', async () => {
    await act.listClinicBroadcastTargets(ctxA)
    expect(lastArg(p.user.findMany).where!.clientId).toBe('clinic-A')
    await act.listClinicMembers(ctxA)
    expect(lastArg(p.user.findMany).where!.clientId).toBe('clinic-A')
  })
})

describe('Notificações da clínica — escopo clientId + userId', () => {
  it('listClinicNotifications filtra por userId E clientId', async () => {
    await notif.listClinicNotifications(ctxA)
    const w = lastArg(p.notification.findMany).where!
    expect(w.userId).toBe('user-A')
    expect(w.clientId).toBe('clinic-A')
  })

  it('countUnreadClinicNotifications escopa por clientId', async () => {
    await notif.countUnreadClinicNotifications(ctxA)
    expect(lastArg(p.notification.count).where!.clientId).toBe('clinic-A')
  })

  it('markClinicNotificationRead só marca notificação do próprio usuário/clínica', async () => {
    await notif.markClinicNotificationRead(ctxA, 'notif-1')
    const w = lastArg(p.notification.updateMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.userId).toBe('user-A')
  })

  it('deleteClinicNotification escopa por clientId+userId', async () => {
    await notif.deleteClinicNotification(ctxA, 'notif-1')
    const w = lastArg(p.notification.deleteMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.userId).toBe('user-A')
  })

  it('listClinicRecipients pega só membros da própria clínica', async () => {
    await notif.listClinicRecipients(ctxA)
    expect(lastArg(p.user.findMany).where!.clientId).toBe('clinic-A')
  })
})

describe('Calendário da clínica — escopo clientId forçado', () => {
  const range = { from: new Date('2026-01-01'), to: new Date('2026-12-31') }

  it('listClinicCalendarEvents força clientId', async () => {
    await cal.listClinicCalendarEvents(ctxA, range)
    expect(lastArg(p.calendarEvent.findMany).where!.clientId).toBe('clinic-A')
  })

  it('findClinicCalendarEventById escopa por clientId', async () => {
    await cal.findClinicCalendarEventById(ctxA, 'evt-1')
    expect(lastArg(p.calendarEvent.findFirst).where!.clientId).toBe('clinic-A')
  })

  it('createClinicCalendarEvent grava clientId da sessão', async () => {
    await cal.createClinicCalendarEvent(ctxA, { userId: 'user-A', title: 'x', startAt: new Date() })
    expect(lastArg(p.calendarEvent.create).data!.clientId).toBe('clinic-A')
  })

  it('updateClinicCalendarEvent e softDelete escopam por clientId', async () => {
    await cal.updateClinicCalendarEvent(ctxA, 'evt-1', { title: 'y' })
    expect(lastArg(p.calendarEvent.updateMany).where!.clientId).toBe('clinic-A')
    await cal.softDeleteClinicCalendarEvent(ctxA, 'evt-1')
    expect(lastArg(p.calendarEvent.updateMany).where!.clientId).toBe('clinic-A')
  })

  it('sync e softDelete por atividade nunca cruzam domínio (clientId no where)', async () => {
    ;(
      p.calendarEvent.findFirst as { mockResolvedValueOnce: (v: unknown) => void }
    ).mockResolvedValueOnce({ id: 'evt-1' })
    await cal.syncClinicCalendarEventForActivity(ctxA, 'act-1', { title: 'z' })
    expect(lastArg(p.calendarEvent.updateMany).where!.clientId).toBe('clinic-A')

    await cal.softDeleteClinicCalendarEventForActivity(ctxA, 'act-1')
    const w = lastArg(p.calendarEvent.updateMany).where!
    expect(w.clientId).toBe('clinic-A')
    expect(w.activityId).toBe('act-1')
  })
})

describe('Invariante: clínica vizinha nunca aparece', () => {
  it('nenhum where/data montado pelos repos referencia a clínica B', async () => {
    await act.listClinicActivities(ctxA, { view: 'today' })
    await notif.listClinicNotifications(ctxA)
    await cal.listClinicCalendarEvents(ctxA, { from: new Date(), to: new Date() })

    const serialized = JSON.stringify([
      lastArg(p.activity.findMany),
      lastArg(p.notification.findMany),
      lastArg(p.calendarEvent.findMany),
    ])
    expect(serialized).not.toContain(OTHER)
    expect(serialized).toContain('clinic-A')
  })
})
