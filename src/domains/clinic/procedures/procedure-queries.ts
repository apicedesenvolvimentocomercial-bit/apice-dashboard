import { getClinicContext } from '@/server/auth/clinic-context'
import { getProceduresWithStats } from '@/server/queries/financial-queries'

/**
 * Porta de Procedimentos do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da
 * sessão via `getClinicContext()`; reusa a query compartilhada (com guards).
 */
export async function getClinicProceduresWithStats() {
  const { clientId } = await getClinicContext()
  return getProceduresWithStats(clientId)
}
