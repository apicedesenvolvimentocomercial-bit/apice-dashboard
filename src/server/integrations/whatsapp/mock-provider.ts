import { randomBytes } from 'crypto'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type {
  IWhatsappProvider,
  IntegrationStatus,
  SendWhatsappArgs,
  SendWhatsappResult,
} from '../types'

export class WhatsappMockProvider implements IWhatsappProvider {
  readonly name = 'whatsapp' as const

  async status(): Promise<IntegrationStatus> {
    return {
      provider: 'whatsapp',
      enabled: env.WHATSAPP_API_ENABLED,
      mock: true,
      connectedAccount: env.WHATSAPP_API_ENABLED ? 'mock-account-001' : null,
      lastSyncAt: env.WHATSAPP_API_ENABLED ? new Date() : null,
    }
  }

  async sendMessage(args: SendWhatsappArgs): Promise<SendWhatsappResult> {
    logger.info('WhatsApp mock send', {
      to: args.to,
      template: args.template,
      vars: Object.keys(args.variables ?? {}),
    })
    return {
      externalId: `mock-${randomBytes(6).toString('hex')}`,
      status: 'queued',
    }
  }
}
