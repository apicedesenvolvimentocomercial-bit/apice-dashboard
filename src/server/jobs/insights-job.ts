import { logger } from '@/lib/logger'

import { runInsightsForAllClinics } from '@/server/services/insights/engine'

export async function runInsightsJob(now: Date = new Date()) {
  const startedAt = Date.now()
  const result = await runInsightsForAllClinics({ now })
  logger.info('Insights job complete', {
    clinics: result.clinics,
    ...result.totals,
    durationMs: Date.now() - startedAt,
  })
  return result
}
