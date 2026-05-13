import type { Metadata } from 'next'

import { UnifiedCalendar } from '@/modules/calendar/unified-calendar'
import { getUnifiedCalendar } from '@/server/queries/calendar-queries'

export const metadata: Metadata = { title: 'Calendário' }

export default async function AdminCalendarPage() {
  // Carrega ±45 dias da data atual — janela suficiente para mês + semana.
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 45)
  const to = new Date(now)
  to.setDate(to.getDate() + 45)

  const events = await getUnifiedCalendar({ from, to })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
        <p className="text-muted-foreground">
          Agendamentos das clínicas e suas atividades em um só lugar
        </p>
      </div>

      <UnifiedCalendar events={events} />
    </div>
  )
}
