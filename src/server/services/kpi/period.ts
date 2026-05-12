import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, spDate } from '@/lib/date'

import type { Period, PeriodRange } from './types'

export const VALID_PERIODS: Period[] = ['day', 'week', 'month', 'quarter', 'custom']

/**
 * Resolve um Period (key) em PeriodRange (from/to) considerando o fuso de SP.
 * Para 'custom', exige from/to em ISO yyyy-mm-dd.
 */
export function resolvePeriod(
  key: Period,
  reference: Date = new Date(),
  custom?: { from?: string; to?: string }
): PeriodRange {
  const zoned = toZonedTime(reference, APP_TIMEZONE)
  const year = zoned.getFullYear()
  const month0 = zoned.getMonth()
  const day = zoned.getDate()

  if (key === 'day') {
    const from = spDate(year, month0, day, 0, 0, 0)
    const to = new Date(spDate(year, month0, day + 1, 0, 0, 0).getTime() - 1)
    return { key, from, to }
  }

  if (key === 'week') {
    const dow = zoned.getDay()
    const from = spDate(year, month0, day - dow, 0, 0, 0)
    const to = new Date(spDate(year, month0, day - dow + 7, 0, 0, 0).getTime() - 1)
    return { key, from, to }
  }

  if (key === 'quarter') {
    const quarterStartMonth = month0 - (month0 % 3)
    const from = spDate(year, quarterStartMonth, 1)
    const to = new Date(spDate(year, quarterStartMonth + 3, 1).getTime() - 1)
    return { key, from, to }
  }

  if (key === 'custom' && custom?.from && custom?.to) {
    const parse = (s: string) => {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
      if (!m) return null
      return { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) }
    }
    const f = parse(custom.from)
    const t = parse(custom.to)
    if (f && t) {
      const from = spDate(f.y, f.mo, f.d, 0, 0, 0)
      const to = new Date(spDate(t.y, t.mo, t.d + 1, 0, 0, 0).getTime() - 1)
      return { key: 'custom', from, to }
    }
  }

  // default: month
  const from = spDate(year, month0, 1)
  const to = new Date(spDate(year, month0 + 1, 1).getTime() - 1)
  return { key: 'month', from, to }
}

/**
 * Período imediatamente anterior, do mesmo tamanho, útil para deltas.
 */
export function previousPeriod(range: PeriodRange): { from: Date; to: Date } {
  const durationMs = range.to.getTime() - range.from.getTime() + 1
  const to = new Date(range.from.getTime() - 1)
  const from = new Date(range.from.getTime() - durationMs)
  return { from, to }
}
