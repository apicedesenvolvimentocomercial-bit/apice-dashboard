import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'

/**
 * Semeia as pipelines nativas (Comercial + Retenção) de uma clínica recém-criada.
 * Mantém o nome antigo (`createDefaultPipelineStages`) para os callers; a lógica
 * agora vive em `ensureNativePipelines` (cria a Pipeline + suas etapas nativas).
 */
export async function createDefaultPipelineStages(clientId: string, organizationId: string) {
  return ensureNativePipelines(clientId, organizationId)
}
