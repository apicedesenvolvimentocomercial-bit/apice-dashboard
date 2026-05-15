/**
 * Contrato comum a todos os providers de integração externa.
 * Implementações concretas vivem em `./whatsapp`, `./metaAds`, `./googleAds`.
 *
 * No MVP só existem `MockProvider`s — suficientes para que UI e jobs já
 * consumam a interface real. Em produção, basta trocar a fábrica em
 * `index.ts` por uma implementação que fala com a API externa, sem alterar
 * o código consumidor (Strategy/Adapter, Seção 7.21 do prompt).
 */

export type IntegrationProviderName = 'whatsapp' | 'metaAds' | 'googleAds'

export type IntegrationStatus = {
  provider: IntegrationProviderName
  enabled: boolean
  mock: boolean
  connectedAccount: string | null
  lastSyncAt: Date | null
}

export type SendWhatsappArgs = {
  to: string
  template: string
  variables?: Record<string, string>
}

export type SendWhatsappResult = {
  externalId: string
  status: 'queued' | 'sent' | 'failed'
}

export type AdSpendRow = {
  campaignId: string
  campaignName: string
  date: string // YYYY-MM-DD
  spend: number
  impressions: number
  clicks: number
  leads: number
}

export interface IIntegrationProvider {
  readonly name: IntegrationProviderName
  status(): Promise<IntegrationStatus>
}

export interface IWhatsappProvider extends IIntegrationProvider {
  sendMessage(args: SendWhatsappArgs): Promise<SendWhatsappResult>
}

export interface IAdsProvider extends IIntegrationProvider {
  fetchSpend(range: { from: Date; to: Date }): Promise<AdSpendRow[]>
}
