import type { ClientStatus } from '@prisma/client'

import { listClients, findClientById } from '@/server/repositories/client-repository'
import { getTenantContext } from '@/server/tenant/context'

export async function getClients(filters?: { status?: ClientStatus; search?: string }) {
  const ctx = await getTenantContext()
  return listClients(ctx, filters)
}

export async function getClient(clientId: string) {
  const ctx = await getTenantContext()
  return findClientById(ctx, clientId)
}
