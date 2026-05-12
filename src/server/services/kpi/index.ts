export * from './types'
export * from './period'
export * from './commercial'
export * from './financial'
export * from './health-score'
export * from './clinic-kpis'

export function parsePeriodParam(raw: unknown): import('./types').Period {
  const allowed = ['day', 'week', 'month', 'quarter', 'custom'] as const
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
    return raw as import('./types').Period
  }
  return 'month'
}
