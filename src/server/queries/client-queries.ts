import type { ClientStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { listClients, findClientById } from '@/server/repositories/client-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

export async function getClients(filters?: { status?: ClientStatus; search?: string }) {
  const ctx = await getTenantContext()
  return listClients(ctx, filters)
}

export async function getClient(clientId: string) {
  const ctx = await getTenantContext()
  return findClientById(ctx, clientId)
}

export async function getClinicUsers(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  return prisma.user.findMany({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
      deletedAt: null,
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })
}

export async function getClinicInvitations(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  return prisma.invitation.findMany({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      acceptedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  })
}

export type ClinicUser = Awaited<ReturnType<typeof getClinicUsers>>[number]
export type ClinicInvitation = Awaited<ReturnType<typeof getClinicInvitations>>[number]
