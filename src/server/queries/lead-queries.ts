import { getPipeline, findLeadById } from '@/server/repositories/lead-repository'
import { getTenantContext } from '@/server/tenant/context'

export async function getPipelineData(clientId: string) {
  const ctx = await getTenantContext()
  return getPipeline(ctx, clientId)
}

export async function getLead(leadId: string) {
  const ctx = await getTenantContext()
  return findLeadById(ctx, leadId)
}
