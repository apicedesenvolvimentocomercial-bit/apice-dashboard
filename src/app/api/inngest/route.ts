import { serve } from 'inngest/next'

import { inngest } from '@/inngest/client'
import { functions } from '@/inngest/functions'

export const runtime = 'nodejs'

/**
 * Endpoint do Inngest (decisão Q1). O Inngest chama esta rota para executar as
 * funções agendadas/de evento; em produção a chamada é assinada com
 * INNGEST_SIGNING_KEY (o `serve` valida sozinho).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
