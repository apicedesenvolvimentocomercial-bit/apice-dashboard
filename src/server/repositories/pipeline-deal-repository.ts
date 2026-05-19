import type { DealStage, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PipelineDealRow = Awaited<ReturnType<typeof listPipelineDeals>>[number]

export async function listPipelineDeals(ctx: TenantContext) {
  return prisma.pipelineDeal.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    // Dentro da mesma coluna, segue a ordem manual (position). Empate cai
    // no updatedAt como desempate determinístico.
    orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      stage: true,
      position: true,
      value: true,
      probability: true,
      expectedCloseAt: true,
      wonAt: true,
      lostAt: true,
      lostReason: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      client: {
        select: {
          id: true,
          name: true,
          status: true,
          city: true,
          state: true,
        },
      },
    },
  })
}

export async function createPipelineDeal(
  ctx: TenantContext,
  data: {
    clientId: string
    stage?: DealStage
    value?: number
    probability?: number
    expectedCloseAt?: Date
    notes?: string
  }
) {
  return prisma.pipelineDeal.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: data.clientId,
      stage: data.stage ?? 'PROSPECT',
      value: data.value,
      probability: data.probability,
      expectedCloseAt: data.expectedCloseAt,
      notes: data.notes,
    },
  })
}

export async function updatePipelineDeal(
  ctx: TenantContext,
  dealId: string,
  data: Partial<{
    stage: DealStage
    value: number | null
    probability: number | null
    expectedCloseAt: Date | null
    notes: string | null
    wonAt: Date | null
    lostAt: Date | null
    lostReason: string | null
  }>
) {
  return prisma.pipelineDeal.updateMany({
    where: { id: dealId, organizationId: ctx.organizationId, deletedAt: null },
    data: data as Prisma.PipelineDealUpdateManyMutationInput,
  })
}

export async function moveStage(
  ctx: TenantContext,
  dealId: string,
  stage: DealStage,
  extra?: { lostReason?: string; position?: number }
) {
  const now = new Date()
  const data: Prisma.PipelineDealUpdateManyMutationInput = { stage }
  if (stage === 'WON') {
    data.wonAt = now
    data.lostAt = null
    data.lostReason = null
  } else if (stage === 'LOST') {
    data.lostAt = now
    data.wonAt = null
    data.lostReason = extra?.lostReason ?? null
  } else {
    data.wonAt = null
    data.lostAt = null
    data.lostReason = null
  }
  if (typeof extra?.position === 'number' && Number.isFinite(extra.position)) {
    data.position = extra.position
  }
  return prisma.pipelineDeal.updateMany({
    where: { id: dealId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function reorderDeal(ctx: TenantContext, dealId: string, position: number) {
  return prisma.pipelineDeal.updateMany({
    where: { id: dealId, organizationId: ctx.organizationId, deletedAt: null },
    data: { position },
  })
}

export async function softDeletePipelineDeal(ctx: TenantContext, dealId: string) {
  return prisma.pipelineDeal.updateMany({
    where: { id: dealId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

export async function findClientsWithoutDeal(ctx: TenantContext) {
  return prisma.client.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      pipelineDeals: { none: { deletedAt: null } },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, status: true },
  })
}
