import { describe, expect, it } from 'vitest'

import { decideCancellationStatus } from './no-show-window'

// Horários em SP (UTC-3). Usamos ISO com offset explícito para fixar o wall-clock.
const sched = new Date('2026-05-20T14:00:00-03:00') // 20/mai 14h SP

describe('decideCancellationStatus', () => {
  describe('regra do mesmo dia (windowHours = null)', () => {
    it('cancelar no mesmo dia do procedimento = NO_SHOW', () => {
      const now = new Date('2026-05-20T09:00:00-03:00') // mesmo dia, antes do horário
      expect(decideCancellationStatus(sched, now, null)).toBe('NO_SHOW')
    })

    it('cancelar depois do horário (mesmo dia) = NO_SHOW', () => {
      const now = new Date('2026-05-20T18:00:00-03:00')
      expect(decideCancellationStatus(sched, now, null)).toBe('NO_SHOW')
    })

    it('cancelar em dia anterior = CANCELED', () => {
      const now = new Date('2026-05-19T23:00:00-03:00')
      expect(decideCancellationStatus(sched, now, null)).toBe('CANCELED')
    })

    it('cancelar dias depois (não compareceu) = NO_SHOW', () => {
      const now = new Date('2026-05-22T10:00:00-03:00')
      expect(decideCancellationStatus(sched, now, null)).toBe('NO_SHOW')
    })
  })

  describe('janela em horas (windowHours = 24)', () => {
    it('cancelar dentro de 24h antes = NO_SHOW', () => {
      const now = new Date('2026-05-20T02:00:00-03:00') // 12h antes
      expect(decideCancellationStatus(sched, now, 24)).toBe('NO_SHOW')
    })

    it('cancelar mais de 24h antes = CANCELED', () => {
      const now = new Date('2026-05-18T14:00:00-03:00') // 48h antes
      expect(decideCancellationStatus(sched, now, 24)).toBe('CANCELED')
    })

    it('exatamente na borda (24h antes) = NO_SHOW', () => {
      const now = new Date('2026-05-19T14:00:00-03:00') // 24h exatas
      expect(decideCancellationStatus(sched, now, 24)).toBe('NO_SHOW')
    })
  })

  it('janela 0 = só conta depois do horário', () => {
    const before = new Date('2026-05-20T13:59:00-03:00')
    const after = new Date('2026-05-20T14:01:00-03:00')
    expect(decideCancellationStatus(sched, before, 0)).toBe('CANCELED')
    expect(decideCancellationStatus(sched, after, 0)).toBe('NO_SHOW')
  })
})
