import { getClinicContext } from '@/server/auth/clinic-context'
import { getClient } from '@/server/queries/client-queries'
import { getClinicDashboard } from '@/server/queries/dashboard-queries'
import type { Period } from '@/server/services/kpi/types'

/**
 * Portas do Overview/Dashboard do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId`
 * da sessão via `getClinicContext()`; reusam queries compartilhadas (com guards).
 */
export async function getClinicProfile() {
  const { clientId } = await getClinicContext()
  return getClient(clientId)
}

export async function getClinicOverviewDashboard(period: Period, from?: string, to?: string) {
  const { clientId } = await getClinicContext()
  return getClinicDashboard(clientId, period, from, to)
}
