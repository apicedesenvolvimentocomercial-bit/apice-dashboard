import { getClinicContext } from '@/server/auth/clinic-context'
import { getPatients } from '@/server/queries/patient-queries'

/**
 * Porta de leitura de Pacientes do DOMÍNIO CLÍNICA (reforma C — híbrido).
 *
 * NÃO recebe `clientId` por parâmetro — ele vem de `getClinicContext()` (sessão,
 * não-nulo, garantido por tipo). Impossível passar a clínica errada. Reusa a query
 * compartilhada (cálculo idêntico ao admin + `assertClientAccess`/`assertCan`); só
 * a barreira de acesso (origem do clientId) é isolada por domínio.
 */
export async function getClinicPatients(filters?: { search?: string }) {
  const { clientId } = await getClinicContext()
  return getPatients(clientId, filters)
}
