import { getClinicContext } from '@/server/auth/clinic-context'
import { getClinicDashboard } from '@/server/queries/dashboard-queries'
import type { Period } from '@/server/services/kpi/types'

/**
 * Porta do Overview/Dashboard do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId`
 * da sessão via `getClinicContext()`; reusa a query compartilhada (com guards).
 * (O perfil da clínica p/ o chrome vive em `domains/clinic/chrome`.)
 */
export async function getClinicOverviewDashboard(period: Period, from?: string, to?: string) {
  const { clientId } = await getClinicContext()
  return getClinicDashboard(clientId, period, from, to)
}
