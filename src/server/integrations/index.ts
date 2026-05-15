import { GoogleAdsMockProvider } from './googleAds/mock-provider'
import { MetaAdsMockProvider } from './metaAds/mock-provider'
import type { IAdsProvider, IWhatsappProvider, IntegrationStatus } from './types'
import { WhatsappMockProvider } from './whatsapp/mock-provider'

/**
 * Factory central das integrações. Em MVP, todas retornam mocks; quando uma
 * implementação real existir, basta condicionar pela env flag aqui sem alterar
 * o resto do código.
 */
export function getWhatsappProvider(): IWhatsappProvider {
  return new WhatsappMockProvider()
}

export function getMetaAdsProvider(): IAdsProvider {
  return new MetaAdsMockProvider()
}

export function getGoogleAdsProvider(): IAdsProvider {
  return new GoogleAdsMockProvider()
}

export async function getAllIntegrationStatuses(): Promise<IntegrationStatus[]> {
  return Promise.all([
    getWhatsappProvider().status(),
    getMetaAdsProvider().status(),
    getGoogleAdsProvider().status(),
  ])
}

export type { IntegrationStatus } from './types'
