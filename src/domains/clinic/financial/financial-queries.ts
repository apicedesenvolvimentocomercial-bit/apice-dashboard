import { getClinicContext } from '@/server/auth/clinic-context'
import {
  getCosts,
  getFinancialOverview,
  getPatientsForSelect,
  getProceduresForSelect,
  getProceduresWithStats,
  getRevenues,
} from '@/server/queries/financial-queries'

/**
 * Porta de Financeiro do DOMÍNIO CLÍNICA (reforma C — híbrido). Orquestra as
 * fontes da tela financeira numa passada; `clientId` da sessão via
 * `getClinicContext()`. Reusa as queries compartilhadas (com guards).
 */
export async function getClinicFinancialPage() {
  const { clientId } = await getClinicContext()
  const [overview, revenues, costs, procedures, proceduresForSelect, patients] = await Promise.all([
    getFinancialOverview(clientId),
    getRevenues(clientId),
    getCosts(clientId),
    getProceduresWithStats(clientId),
    getProceduresForSelect(clientId),
    getPatientsForSelect(clientId),
  ])
  return { overview, revenues, costs, procedures, proceduresForSelect, patients }
}
