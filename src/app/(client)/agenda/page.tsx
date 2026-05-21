import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Metadata } from 'next'

import { ClinicCalendarPage } from '@/components/clinic/calendar/clinic-calendar-page'
import { getClinicCalendar } from '@/domains/clinic/calendar/calendar-queries'

export const metadata: Metadata = { title: 'Calendário' }

export default async function ClinicCalendarRoute() {
  // Janela = mês corrente. getClinicCalendar usa getClinicContext (escopo
  // clientId garantido).
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { events } = await getClinicCalendar({ from, to })

  return (
    <ClinicCalendarPage events={events} monthLabel={format(now, 'MMMM yyyy', { locale: ptBR })} />
  )
}
