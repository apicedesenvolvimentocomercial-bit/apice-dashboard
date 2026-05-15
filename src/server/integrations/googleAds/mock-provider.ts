import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { AdSpendRow, IAdsProvider, IntegrationStatus } from '../types'

export class GoogleAdsMockProvider implements IAdsProvider {
  readonly name = 'googleAds' as const

  async status(): Promise<IntegrationStatus> {
    return {
      provider: 'googleAds',
      enabled: env.GOOGLE_ADS_ENABLED,
      mock: true,
      connectedAccount: env.GOOGLE_ADS_ENABLED ? 'mock-google-ad-account' : null,
      lastSyncAt: env.GOOGLE_ADS_ENABLED ? new Date() : null,
    }
  }

  async fetchSpend(range: { from: Date; to: Date }): Promise<AdSpendRow[]> {
    logger.info('Google Ads mock fetch', { from: range.from, to: range.to })
    return []
  }
}
