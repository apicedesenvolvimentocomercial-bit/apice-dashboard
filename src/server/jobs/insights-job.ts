import { logger } from '@/lib/logger'

import { runInsightsForAllClinics } from '@/server/services/insights/engine'

export async function runInsightsJob(now: Date = new Date()) {
  const result = await runInsightsForAllClinics({ now })
  logger.info('Insights job complete', { clinics: result.clinics, ...result.totals })
  return result
}
