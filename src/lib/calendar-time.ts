import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, parseLocalDate, spDate } from './date'

// Combina YYYY-MM-DD + HH:mm (opcional) no fuso de SP. Se time vier null,
// usa meio-dia SP (12:00) como hora neutra que não atravessa fronteiras
// de dia em fusos próximos.
export function combineCalendarDateTime(dateStr: string, timeStr: string | null): Date | null {
  const base = parseLocalDate(dateStr)
  if (!base) return null
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return base

  const [hh, mm] = timeStr.split(':').map(Number)
  const zoned = toZonedTime(base, APP_TIMEZONE)
  return spDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), hh, mm, 0)
}

// Formata um Date como ISO 8601 sem offset com os componentes em SP.
// Use para passar para o FullCalendar (modo `local`): ele trata strings sem
// timezone como hora literal, garantindo que o evento caia na data SP correta
// independente do fuso do navegador.
//
// Ex.: 2026-05-20T02:59:00Z (= 23:59 SP) → "2026-05-19T23:59:00"
const SP_ISO_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function toSPWallClock(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  // sv-SE locale produz "YYYY-MM-DD HH:mm:ss"; troca o espaço por 'T' pra ISO.
  return SP_ISO_FORMATTER.format(date).replace(' ', 'T')
}
