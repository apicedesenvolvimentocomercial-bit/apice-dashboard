import { toSPWallClock } from '@/lib/calendar-time'
import type { CalendarEvent } from '@/shared/calendar-types'

const ONE_HOUR_MS = 60 * 60 * 1000

export type FcMappedEvent = {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  source: CalendarEvent
}

/**
 * Mapeia um CalendarEvent (evento pessoal) p/ o shape do FullCalendar em
 * wall-clock SP — regra extraída do CalendarInner (comportamento idêntico):
 *
 * Atividade "fim do dia" (sentinela 23:59 SP, sem `end`) não tem horário
 * real: é só um prazo "vence neste dia". No timeGrid (dia/semana) um bloco
 * às 23:59 cai no rodapé do grid com 1 min de altura e fica cortado pela
 * borda. Por isso esses eventos viram all-day — caem na faixa all-day do
 * topo (nunca cortada) na visão dia/semana e como bloco normal no mês.
 *
 * Demais eventos sem `end` assumem 1h como bloco de tempo real. O fim é
 * clampado no mesmo dia SP pra barra não esticar pro dia seguinte quando
 * começa perto da meia-noite. O clamp NÃO pode igualar o start (duração
 * zero): o FullCalendar trataria como "sem fim" e aplicaria 1h default,
 * transbordando pro dia seguinte. Por isso fecha em 23:59:59. Eventos com
 * `end` mantêm o horário.
 */
export function mapCalendarEventToFc(e: CalendarEvent): FcMappedEvent {
  const start = toSPWallClock(e.start)

  // Sentinela de fim de dia: 23:59 SP sem `end` → all-day.
  const isEndOfDaySentinel = e.end == null && start.slice(11, 16) === '23:59'
  if (isEndOfDaySentinel) {
    return {
      id: e.id,
      title: e.title,
      start: start.slice(0, 10),
      allDay: true,
      source: e,
    }
  }

  let end: string
  if (e.end != null) {
    end = toSPWallClock(e.end)
  } else {
    const oneHourLater = toSPWallClock(new Date(e.start.getTime() + ONE_HOUR_MS))
    const sameDay = oneHourLater.slice(0, 10) === start.slice(0, 10)
    end = sameDay ? oneHourLater : `${start.slice(0, 10)}T23:59:59`
  }
  return {
    id: e.id,
    title: e.title,
    start,
    end,
    allDay: false,
    source: e,
  }
}
