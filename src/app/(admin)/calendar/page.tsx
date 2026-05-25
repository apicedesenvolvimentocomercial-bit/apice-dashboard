import type { Metadata } from 'next'

import { UserCalendar } from '@/modules/calendar/user-calendar'
import { gateAgencyTab } from '@/server/auth/agency-tabs'
import { getUserCalendar } from '@/server/queries/calendar-queries'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Calendário' }

export default async function AdminCalendarPage() {
  await gateAgencyTab('calendar')
  // Janela ampla (±90 dias) — cobre views de mês adjacente sem nova fetch.
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 90)
  const to = new Date(now)
  to.setDate(to.getDate() + 90)

  const [{ events, holidays }, ctx] = await Promise.all([
    getUserCalendar({ from, to }),
    getTenantContext(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
        <p className="text-muted-foreground">Seus eventos e atividades sincronizadas</p>
      </div>

      <UserCalendar events={events} holidays={holidays} isAdmin={ctx.role === 'ADMIN'} />
    </div>
  )
}
