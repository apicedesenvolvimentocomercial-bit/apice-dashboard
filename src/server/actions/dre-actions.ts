'use server'

import { getDreReport } from '@/server/queries/dre-queries'
import type { Period } from '@/server/services/kpi/types'
import { runAction } from '@/types/errors'

/**
 * Wrapper de action p/ a aba DRE (client) buscar o relatório por período. O gate
 * (financial:read), o escopo de RLS e o cálculo vivem em `getDreReport`.
 */
export async function getDreReportAction(
  clientId: string,
  opts: { period?: Period; from?: string; to?: string }
) {
  return runAction(() => getDreReport(clientId, opts))
}
