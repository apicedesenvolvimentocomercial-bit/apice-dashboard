import { getClinicContext } from '@/server/auth/clinic-context'
import { getGoalsWithProgress } from '@/server/queries/goal-queries'

/**
 * Porta de Metas do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da sessão
 * via `getClinicContext()`; reusa a query compartilhada (cálculo de progresso +
 * guards idênticos ao admin).
 */
export async function getClinicGoals(options?: { includePast?: boolean }) {
  const { clientId } = await getClinicContext()
  return getGoalsWithProgress(clientId, options)
}
