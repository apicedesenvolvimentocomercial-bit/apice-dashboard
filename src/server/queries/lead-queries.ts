import { getPipeline, findLeadById } from '@/server/repositories/lead-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export async function getPipelineData(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'read')
  return getPipeline(ctx, clientId)
}

export async function getLead(leadId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'crm', 'read')
  return findLeadById(ctx, leadId)
}
