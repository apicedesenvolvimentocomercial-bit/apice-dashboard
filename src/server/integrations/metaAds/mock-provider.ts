import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { AdSpendRow, IAdsProvider, IntegrationStatus } from '../types'

export class MetaAdsMockProvider implements IAdsProvider {
  readonly name = 'metaAds' as const

  async status(): Promise<IntegrationStatus> {
    return {
      provider: 'metaAds',
      enabled: env.META_ADS_ENABLED,
      mock: true,
      connectedAccount: env.META_ADS_ENABLED ? 'mock-meta-ad-account' : null,
      lastSyncAt: env.META_ADS_ENABLED ? new Date() : null,
    }
  }

  async fetchSpend(range: { from: Date; to: Date }): Promise<AdSpendRow[]> {
    logger.info('Meta Ads mock fetch', { from: range.from, to: range.to })
    // Retorna lista vazia: o motor de KPI já lida com dados ausentes.
    return []
  }
}
