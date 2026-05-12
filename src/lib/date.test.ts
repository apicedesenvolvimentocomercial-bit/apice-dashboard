import { describe, expect, it } from 'vitest'

import { APP_TIMEZONE, clampDayToMonth, monthBoundsFor, parseLocalDate, spDate } from './date'

describe('lib/date', () => {
  it('APP_TIMEZONE é America/Sao_Paulo', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo')
  })

  describe('spDate', () => {
    it('cria 2025-01-15 12:00 em SP como UTC correto', () => {
      // SP é UTC-3 (sem horário de verão em 2025); 12:00 SP = 15:00 UTC
      const d = spDate(2025, 0, 15, 12, 0, 0)
      expect(d.toISOString()).toBe('2025-01-15T15:00:00.000Z')
    })

    it('cria 2025-06-15 00:00 em SP como UTC correto', () => {
      // SP UTC-3; 00:00 SP = 03:00 UTC
      const d = spDate(2025, 5, 15)
      expect(d.toISOString()).toBe('2025-06-15T03:00:00.000Z')
    })
  })

  describe('clampDayToMonth', () => {
    it('mantém o dia se cabe no mês', () => {
      const d = clampDayToMonth(2025, 0, 15) // janeiro
      const iso = d.toISOString()
      expect(iso.startsWith('2025-01-15')).toBe(true)
    })

    it('reduz dia 31 para 28 em fevereiro de ano não-bissexto', () => {
      const d = clampDayToMonth(2025, 1, 31) // fev 2025
      const iso = d.toISOString()
      expect(iso.startsWith('2025-02-28')).toBe(true)
    })

    it('reduz dia 31 para 29 em fevereiro de ano bissexto', () => {
      const d = clampDayToMonth(2024, 1, 31)
      const iso = d.toISOString()
      expect(iso.startsWith('2024-02-29')).toBe(true)
    })

    it('reduz dia 31 para 30 em abril', () => {
      const d = clampDayToMonth(2025, 3, 31)
      const iso = d.toISOString()
      expect(iso.startsWith('2025-04-30')).toBe(true)
    })
  })

  describe('monthBoundsFor', () => {
    it('retorna start/end consistentes para uma data em maio', () => {
      const ref = spDate(2025, 4, 11, 14, 30, 0) // 11/mai/2025 14:30 SP
      const b = monthBoundsFor(ref)
      expect(b.year).toBe(2025)
      expect(b.month0).toBe(4)
      expect(b.day).toBe(11)
      expect(b.monthStart.toISOString()).toBe('2025-05-01T03:00:00.000Z')
      expect(b.nextMonthStart.toISOString()).toBe('2025-06-01T03:00:00.000Z')
    })
  })

  describe('parseLocalDate', () => {
    it('aceita YYYY-MM-DD', () => {
      const d = parseLocalDate('2025-03-10')
      expect(d).not.toBeNull()
      expect(d!.toISOString().startsWith('2025-03-10')).toBe(true)
    })

    it('aceita DD/MM/YYYY', () => {
      const d = parseLocalDate('10/03/2025')
      expect(d).not.toBeNull()
      expect(d!.toISOString().startsWith('2025-03-10')).toBe(true)
    })

    it('rejeita formato inválido', () => {
      expect(parseLocalDate('not a date')).toBeNull()
      expect(parseLocalDate('2025/03/10')).toBeNull()
      expect(parseLocalDate('')).toBeNull()
    })
  })
})
