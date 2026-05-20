import { describe, expect, it } from 'vitest'

import { combineCalendarDateTime, toSPWallClock } from './calendar-time'

describe('lib/calendar-time', () => {
  describe('combineCalendarDateTime', () => {
    it('YYYY-MM-DD + HH:mm → Date no fuso SP (UTC -3 sem DST em 2025)', () => {
      const d = combineCalendarDateTime('2025-06-15', '14:30')
      expect(d).not.toBeNull()
      // 14:30 SP = 17:30 UTC.
      expect(d!.toISOString()).toBe('2025-06-15T17:30:00.000Z')
    })

    it('23:59 SP cai como 02:59Z do dia seguinte (caso end-of-day)', () => {
      const d = combineCalendarDateTime('2026-05-19', '23:59')
      expect(d!.toISOString()).toBe('2026-05-20T02:59:00.000Z')
    })

    it('00:00 SP cai como 03:00Z do mesmo dia', () => {
      const d = combineCalendarDateTime('2026-05-19', '00:00')
      expect(d!.toISOString()).toBe('2026-05-19T03:00:00.000Z')
    })

    it('sem time → cai no meio-dia SP do parseLocalDate (15:00Z)', () => {
      const d = combineCalendarDateTime('2026-05-19', null)
      expect(d).not.toBeNull()
      // parseLocalDate usa 12:00 SP por convenção neutra.
      expect(d!.toISOString()).toBe('2026-05-19T15:00:00.000Z')
    })

    it('time mal formado é ignorado (cai no meio-dia)', () => {
      const d = combineCalendarDateTime('2026-05-19', 'abc')
      expect(d!.toISOString()).toBe('2026-05-19T15:00:00.000Z')
    })

    it('aceita DD/MM/YYYY no dateStr', () => {
      const d = combineCalendarDateTime('19/05/2026', '10:00')
      expect(d!.toISOString()).toBe('2026-05-19T13:00:00.000Z')
    })

    it('data inválida → null', () => {
      expect(combineCalendarDateTime('not-a-date', '10:00')).toBeNull()
      expect(combineCalendarDateTime('', '10:00')).toBeNull()
    })
  })

  describe('toSPWallClock', () => {
    it('Date em UTC vira ISO sem offset com componentes SP', () => {
      // 02:59Z = 23:59 SP do dia anterior — esse era o bug do calendar.
      const d = new Date('2026-05-20T02:59:00.000Z')
      expect(toSPWallClock(d)).toBe('2026-05-19T23:59:00')
    })

    it('hora intermediária preserva minutos e segundos', () => {
      const d = new Date('2025-06-15T17:30:45.000Z')
      // 17:30:45 UTC = 14:30:45 SP
      expect(toSPWallClock(d)).toBe('2025-06-15T14:30:45')
    })

    it('aceita string ISO como entrada', () => {
      expect(toSPWallClock('2025-06-15T17:30:00.000Z')).toBe('2025-06-15T14:30:00')
    })

    it('meia-noite UTC vira 21:00 do dia anterior em SP', () => {
      const d = new Date('2025-06-15T00:00:00.000Z')
      expect(toSPWallClock(d)).toBe('2025-06-14T21:00:00')
    })

    it('formato é fixo (zero-padded) para datas iniciais do ano', () => {
      const d = new Date('2025-01-05T14:00:00.000Z')
      // 14:00 UTC = 11:00 SP
      expect(toSPWallClock(d)).toBe('2025-01-05T11:00:00')
    })

    it('round-trip combineCalendarDateTime → toSPWallClock preserva wall-clock', () => {
      const original = '2026-05-19T23:59:00'
      const d = combineCalendarDateTime('2026-05-19', '23:59')
      expect(toSPWallClock(d!)).toBe(original)
    })
  })
})
