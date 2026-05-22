import type { InsightCategory, InsightSeverity, InsightStatus } from '@prisma/client'

import { getClinicContext } from '@/server/auth/clinic-context'
import { listInsights } from '@/server/queries/insight-queries'

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
