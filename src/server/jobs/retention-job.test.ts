import { describe, expect, it } from 'vitest'

import { computeRetentionBucket, type BucketInput } from './retention-job'

const NOW = new Date('2026-06-08T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY)
}

function input(overrides: Partial<BucketInput> = {}): BucketInput {
  return {
    now: NOW,
    lastVisitAt: daysAgo(40),
    returnWindowDays: 30,
    hasFutureAppt: false,
    isRecurrent: false,
    winbackDays: 120,
    ...overrides,
  }
}

describe('computeRetentionBucket', () => {
  it('sem visita registrada → NURTURE (neutro)', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: null }))).toBe('NURTURE')
  })

  it('visita há ≤1 dia → POST_CARE', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(0) }))).toBe('POST_CARE')
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(1) }))).toBe('POST_CARE')
  })

  it('recorrente com retorno marcado → LOYALTY (não cai em reativação)', () => {
    expect(
      computeRetentionBucket(
        input({ lastVisitAt: daysAgo(60), hasFutureAppt: true, isRecurrent: true })
      )
    ).toBe('LOYALTY')
  })

  it('retorno marcado mas NÃO recorrente → segue o fluxo de tempo (não LOYALTY)', () => {
    expect(
      computeRetentionBucket(
        input({ lastVisitAt: daysAgo(60), hasFutureAppt: true, isRecurrent: false })
      )
    ).toBe('REACTIVATION')
  })

  it('2–15 dias → NURTURE', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(10) }))).toBe('NURTURE')
  })

  it('dentro da janela de retorno (≤ returnWindowDays) → NURTURE', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(25), returnWindowDays: 30 }))).toBe(
      'NURTURE'
    )
  })

  it('janela venceu, abaixo do winback → REACTIVATION', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(45), returnWindowDays: 30 }))).toBe(
      'REACTIVATION'
    )
  })

  it('acima do winback → WINBACK', () => {
    expect(computeRetentionBucket(input({ lastVisitAt: daysAgo(200), winbackDays: 120 }))).toBe(
      'WINBACK'
    )
  })

  it('recorrência longa do procedimento adia a reativação', () => {
    // 100 dias desde a visita, mas o procedimento recomenda retorno só em 180d →
    // ainda dentro da janela → NURTURE (não reativa cedo demais).
    expect(
      computeRetentionBucket(input({ lastVisitAt: daysAgo(100), returnWindowDays: 180 }))
    ).toBe('NURTURE')
  })
})
