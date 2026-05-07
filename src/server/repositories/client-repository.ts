import type { ClientStatus, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type ClientWithStats = Awaited<ReturnType<typeof listClients>>[number]

export async function listClients(
  ctx: TenantContext,
  filters?: { status?: ClientStatus; search?: string }
) {
  const where: Prisma.ClientWhereInput = {
    organizationId: ctx.organizationId,
    deletedAt: null,
    ...(filters?.status && { status: filters.status }),
    ...(filters?.search && {
      name: { contains: filters.search, mode: 'insensitive' },
    }),
  }

  return prisma.client.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      state: true,
      phone: true,
      email: true,
      status: true,
      monthlyFee: true,
      contractStart: true,
      healthScore: true,
      lastSnapshotAt: true,
      createdAt: true,
      _count: {
        select: { users: { where: { deletedAt: null } } },
      },
    },
  })
}

export async function findClientById(ctx: TenantContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    include: {
      pipelineStages: { orderBy: { order: 'asc' } },
      _count: {
        select: {
          users: { where: { deletedAt: null } },
          leads: { where: { deletedAt: null } },
          procedures: { where: { deletedAt: null } },
        },
      },
    },
  })
}

export async function createClient(
  ctx: TenantContext,
  data: {
    name: string
    slug: string
    city?: string
    state?: string
    phone?: string
    email?: string
    monthlyFee?: number
    contractStart?: Date
    notes?: string
  }
) {
  return prisma.client.create({
    data: {
      ...data,
      organizationId: ctx.organizationId,
      status: 'ONBOARDING',
      monthlyFee: data.monthlyFee ? data.monthlyFee : undefined,
    },
  })
}

export async function updateClient(
  ctx: TenantContext,
  clientId: string,
  data: Partial<{
    name: string
    city: string
    state: string
    phone: string
    email: string
    monthlyFee: number
    contractStart: Date
    notes: string
    status: ClientStatus
  }>
) {
  return prisma.client.updateMany({
    where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeleteClient(ctx: TenantContext, clientId: string) {
  return prisma.client.updateMany({
    where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  })
}

export async function createDefaultPipelineStages(clientId: string) {
  const stages = [
    { name: 'Lead', order: 1, color: '#6366f1', isWon: false, isLost: false },
    { name: 'Agendado', order: 2, color: '#f59e0b', isWon: false, isLost: false },
    { name: 'Compareceu', order: 3, color: '#3b82f6', isWon: false, isLost: false },
    { name: 'Fechado', order: 4, color: '#10b981', isWon: true, isLost: false },
    { name: 'Perdido', order: 5, color: '#ef4444', isWon: false, isLost: true },
  ]

  return prisma.pipelineStage.createMany({
    data: stages.map((s) => ({ ...s, clientId })),
  })
}
