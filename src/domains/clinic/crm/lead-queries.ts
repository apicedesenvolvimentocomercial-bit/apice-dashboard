import { getClinicContext } from '@/server/auth/clinic-context'
import {
  getClinicPipelinesWithStages,
  getProceduresForScheduling,
  getScheduleForScheduling,
} from '@/server/queries/lead-queries'

/**
 * Porta do CRM/Pipeline do DOMÍNIO CLÍNICA (reforma C — híbrido). `clientId` da
 * sessão via `getClinicContext()`; reusa as queries compartilhadas (com guards).
 * Multi-pipeline: a clínica tem N funis (≤6) carregados de uma vez para as abas.
 */
export async function getClinicPipelines() {
  const { clientId } = await getClinicContext()
  return getClinicPipelinesWithStages(clientId)
}

/** Procedimentos da clínica p/ o dialog de Agendado (2a). */
export async function getClinicProceduresForScheduling() {
  const { clientId } = await getClinicContext()
  return getProceduresForScheduling(clientId)
}

/** Expediente da clínica p/ as validações do dialog de Agendado (2a). */
export async function getClinicCrmSchedule() {
  const { clientId } = await getClinicContext()
  return getScheduleForScheduling(clientId)
}
