import { getClinicContext } from '@/server/auth/clinic-context'
import { getPipelineData } from '@/server/queries/lead-queries'

/**
 * Porta do CRM/Pipeline do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da
 * sessão via `getClinicContext()`; reusa a query compartilhada (com guards).
 */
export async function getClinicPipeline() {
  const { clientId } = await getClinicContext()
  return getPipelineData(clientId)
}
