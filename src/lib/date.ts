import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export const APP_TIMEZONE = 'America/Sao_Paulo'

/**
 * Converte um Date "wall-clock" (ano/mês/dia em SP) para um UTC `Date` correto.
 * Use isto sempre que você criar datas a partir de componentes Y/M/D
 * vindos da UI ou de strings de banco/CSV.
 */
export function spDate(
  year: number,
  month0: number,
  day: number,
  hour = 0,
  min = 0,
  sec = 0
): Date {
  // Constrói um Date "como se" fosse local no fuso de SP, depois converte para UTC.
  const naive = new Date(year, month0, day, hour, min, sec, 0)
  return fromZonedTime(naive, APP_TIMEZONE)
}

/**
 * Retorna start/end do mês contendo `reference`, conforme o calendário de SP.
 */
export function monthBoundsFor(reference: Date) {
  const zoned = toZonedTime(reference, APP_TIMEZONE)
  const year = zoned.getFullYear()
  const month0 = zoned.getMonth()
  const day = zoned.getDate()
  return {
    year,
    month0,
    day,
    monthStart: spDate(year, month0, 1),
    nextMonthStart: spDate(year, month0 + 1, 1),
    monthEnd: new Date(spDate(year, month0 + 1, 1).getTime() - 1),
  }
}

/**
 * Último dia válido do mês alvo. Útil para recorrência que cai no dia 31 em meses curtos.
 */
export function clampDayToMonth(year: number, month0: number, day: number): Date {
  // dia 0 do mês seguinte = último dia do mês alvo
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return spDate(year, month0, Math.min(day, lastDay), 12, 0, 0)
}

/**
 * Faz parse de uma string CSV (YYYY-MM-DD ou DD/MM/YYYY) interpretando os
 * componentes no fuso de SP. Retorna null se inválido.
 */
export function parseLocalDate(raw: string): Date | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) {
    const d = spDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    return Number.isNaN(d.getTime()) ? null : d
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) {
    const d = spDate(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Parseia o valor de um input `datetime-local` ("YYYY-MM-DDTHH:mm" sem fuso)
 * como wall-clock de SP → UTC correto. Strings ISO com fuso explícito (Z / ±hh:mm)
 * caem no `new Date` direto. Use em agendamentos (mesma lógica que estava inline
 * em appointment-actions).
 */
export function parseScheduledAt(raw: string): Date {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw)
  if (m) {
    return spDate(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] ?? 0)
    )
  }
  return new Date(raw)
}

/** Data mínima permitida para agendar: 1 ano atrás (bloqueia retroativos antigos). */
export function isTooOldToSchedule(scheduledAt: Date, now: Date = new Date()): boolean {
  const min = new Date(now)
  min.setFullYear(min.getFullYear() - 1)
  return scheduledAt.getTime() < min.getTime()
}

/**
 * Constrói um intervalo a partir de strings YYYY-MM-DD (UI) interpretando-as
 * como dias-cheios no fuso de SP. `to` inclui o dia inteiro até 23:59:59.999.
 */
export function dateRangeFromIsoStrings(fromIso: string, toIso: string): { from: Date; to: Date } {
  const from = parseLocalDate(fromIso)
  const to = parseLocalDate(toIso)
  if (!from || !to) throw new Error('Invalid date range')
  const toEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { from, to: toEnd }
}

/**
 * Bucket de mês em formato YYYY-MM para a data no fuso de SP.
 */
export function monthKey(date: Date): string {
  const zoned = toZonedTime(date, APP_TIMEZONE)
  return `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Label curto pt-BR (ex: "jan/25") do mês de uma data SP.
 */
export function shortMonthLabel(date: Date): string {
  const zoned = toZonedTime(date, APP_TIMEZONE)
  return zoned.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}
