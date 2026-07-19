'use server'

import { z } from 'zod'

import { getDreReport } from '@/server/queries/dre-queries'
import { runAction, ValidationError } from '@/types/errors'

// Espelha o union `Period` de services/kpi/types — manter em sincronia.
const dreOptsSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'quarter', 'custom']).optional(),
  from: z.string().max(30, 'Data inválida').optional(),
  to: z.string().max(30, 'Data inválida').optional(),
})
const clientIdSchema = z.string().min(1).max(64)

/**
 * Wrapper de action p/ a aba DRE (client) buscar o relatório por período. O gate
 * (financial:read), o escopo de RLS e o cálculo vivem em `getDreReport`.
 */
export async function getDreReportAction(
  clientId: string,
  opts: { period?: z.infer<typeof dreOptsSchema>['period']; from?: string; to?: string }
) {
  return runAction(() => {
    const parsedClientId = clientIdSchema.safeParse(clientId)
    const parsedOpts = dreOptsSchema.safeParse(opts)
    if (!parsedClientId.success || !parsedOpts.success) {
      throw new ValidationError('Parâmetros inválidos')
    }
    return getDreReport(parsedClientId.data, parsedOpts.data)
  })
}
