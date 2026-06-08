import type { InsightCategory, InsightSeverity, InsightStatus } from '@prisma/client'

import { getClinicContext } from '@/server/auth/clinic-context'
import { listInsights, listInsightsFresh } from '@/server/queries/insight-queries'

/**
 * Porta de Insights do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da sessão
 * via `getClinicContext()`; reusa a query compartilhada (com guards).
 */
export async function getClinicInsights(filters?: {
  status?: InsightStatus[]
  severity?: InsightSeverity[]
  category?: InsightCategory[]
}) {
  const { clientId } = await getClinicContext()
  return listInsights(clientId, filters)
}

/** Igual a `getClinicInsights`, mas RECALCULA antes (carregamento automático). */
export async function getClinicInsightsFresh(filters?: {
  status?: InsightStatus[]
  severity?: InsightSeverity[]
  category?: InsightCategory[]
}) {
  const { clientId } = await getClinicContext()
  return listInsightsFresh(clientId, filters)
}
