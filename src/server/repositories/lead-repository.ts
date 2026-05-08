import type { LeadSource } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>
export type FullLead = Awaited<ReturnType<typeof findLeadById>>

export async function getPipeline(ctx: TenantContext, clientId: string) {
  return prisma.pipelineStage.findMany({
    where: { clientId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      isWon: true,
      isLost: true,
      order: true,
      leads: {
        where: { organizationId: ctx.organizationId, clientId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          procedureInterest: true,
          tags: true,
          createdAt: true,
          stageId: true,
        },
      },
    },
  })
}

export async function findLeadById(ctx: TenantContext, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      interactions: { orderBy: { createdAt: 'desc' } },
    },
  })
}

export async function createLead(
  ctx: TenantContext,
  clientId: string,
  data: {
    name: string
    phone?: string
    email?: string
    source: LeadSource
    stageId: string
    procedureInterest?: string
    estimatedValue?: number
    notes?: string
    tags?: string[]
  }
) {
  return prisma.lead.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      source: data.source,
      stageId: data.stageId,
      procedureInterest: data.procedureInterest,
      estimatedValue: data.estimatedValue,
      notes: data.notes,
      tags: data.tags ?? [],
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  })
}

export async function updateLead(
  ctx: TenantContext,
  leadId: string,
  data: Partial<{
    name: string
    phone: string
    email: string
    source: LeadSource
    stageId: string
    procedureInterest: string
    estimatedValue: number
    notes: string
  }>
) {
  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: { ...data, updatedById: ctx.userId },
  })
}

export async function moveLead(ctx: TenantContext, leadId: string, stageId: string) {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } })

  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      stageId,
      updatedById: ctx.userId,
      ...(stage?.isWon ? { closedAt: new Date() } : {}),
      ...(stage?.isLost ? { lostAt: new Date() } : {}),
    },
  })
}

export async function softDeleteLead(ctx: TenantContext, leadId: string) {
  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
