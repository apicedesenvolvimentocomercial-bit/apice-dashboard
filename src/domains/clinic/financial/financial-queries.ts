import { getClinicContext } from '@/server/auth/clinic-context'
import {
  getCosts,
  getFinancialOverview,
  getPatientsForSelect,
  getProceduresForSelect,
  getProceduresWithStats,
  getRevenues,
} from '@/server/queries/financial-queries'
import { getRevenueMonthlySeries } from '@/server/queries/revenue-series'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

/**
 * Porta de Financeiro do DOMÍNIO CLÍNICA (reforma C — híbrido). Orquestra as
 * fontes da tela financeira numa passada; `clientId` da sessão via
 * `getClinicContext()`. Reusa as queries compartilhadas (com guards).
 */
export async function getClinicFinancialPage() {
  const { clientId } = await getClinicContext()
  // Contexto de tenant para a série de receita (mesmos guards das demais queries).
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'financial', 'read')
  const [overview, revenueSeries, revenues, costs, procedures, proceduresForSelect, patients] =
    await Promise.all([
      getFinancialOverview(clientId),
      getRevenueMonthlySeries(ctx, clientId),
      getRevenues(clientId),
      getCosts(clientId),
      getProceduresWithStats(clientId),
      getProceduresForSelect(clientId),
      getPatientsForSelect(clientId),
    ])
  return { overview, revenueSeries, revenues, costs, procedures, proceduresForSelect, patients }
}
