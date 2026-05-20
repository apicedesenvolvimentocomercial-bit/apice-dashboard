import { describe, expect, it } from 'vitest'

import { decideCalendarSync } from './activity-calendar-sync'

describe('lib/activity-calendar-sync', () => {
  describe('decideCalendarSync', () => {
    describe('pref = AUTO', () => {
      it('sempre cria evento — ignora flag', () => {
        expect(decideCalendarSync('AUTO', true)).toBe(true)
        expect(decideCalendarSync('AUTO', false)).toBe(true)
        expect(decideCalendarSync('AUTO', undefined)).toBe(true)
      })
    })

    describe('pref = NEVER', () => {
      it('nunca cria evento — ignora flag', () => {
        expect(decideCalendarSync('NEVER', true)).toBe(false)
        expect(decideCalendarSync('NEVER', false)).toBe(false)
        expect(decideCalendarSync('NEVER', undefined)).toBe(false)
      })
    })

    describe('pref = ASK', () => {
      it('cria evento quando flag é true (checkbox marcado)', () => {
        expect(decideCalendarSync('ASK', true)).toBe(true)
      })

      it('não cria quando flag é false (checkbox desmarcado)', () => {
        expect(decideCalendarSync('ASK', false)).toBe(false)
      })

      it('não cria quando flag é undefined (UI não enviou — caller antigo)', () => {
        // Garantia de compatibilidade: chamadas que não passam o flag não
        // disparam sync acidental.
        expect(decideCalendarSync('ASK', undefined)).toBe(false)
      })
    })

    it('matriz completa de combinações', () => {
      const cases: [Parameters<typeof decideCalendarSync>[0], boolean | undefined, boolean][] = [
        ['AUTO', true, true],
        ['AUTO', false, true],
        ['AUTO', undefined, true],
        ['ASK', true, true],
        ['ASK', false, false],
        ['ASK', undefined, false],
        ['NEVER', true, false],
        ['NEVER', false, false],
        ['NEVER', undefined, false],
      ]
      for (const [pref, flag, expected] of cases) {
        expect(decideCalendarSync(pref, flag), `pref=${pref} flag=${flag}`).toBe(expected)
      }
    })
  })
})
