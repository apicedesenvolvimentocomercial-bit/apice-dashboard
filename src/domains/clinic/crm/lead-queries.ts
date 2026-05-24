import type { StageKind } from '@prisma/client'

import { getClinicContext } from '@/server/auth/clinic-context'
import { getPipelineData } from '@/server/queries/lead-queries'

/**
 * Porta do CRM/Pipeline do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da
 * sessão via `getClinicContext()`; reusa a query compartilhada (com guards).
 * `kind` seleciona o funil: NEW (clientes novos) ou EXISTING (já cadastrados).
 */
export async function getClinicPipeline(kind: StageKind = 'NEW') {
  const { clientId } = await getClinicContext()
  return getPipelineData(clientId, kind)
}
