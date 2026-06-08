import type { LeadSource } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>
export type FullLead = Awaited<ReturnType<typeof findLeadById>>

/**
 * Etapas de uma pipeline (com seus leads). Escopa via `pipeline.organizationId`
 * para a barreira de org no nível do repo (SEC-002). A pipeline em si (e as
 * nativas semeadas) é garantida fora daqui — ver pipeline-repository.
 */
export async function getPipeline(
  ctx: TenantContext,
  clientId: string,
  pipelineId: string,
  // Item 4: filtro por dono. `null` = ver todos os cards (admin/titular/viewAll);
  // userId = só os cards desse usuário (Lead.assignedToId).
  ownerId: string | null = null
) {
  return prisma.pipelineStage.findMany({
    where: {
      pipelineId,
      clientId,
      pipeline: { organizationId: ctx.organizationId },
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      isWon: true,
      isLost: true,
      isNative: true,
      nativeKey: true,
      order: true,
      leads: {
        where: {
          organizationId: ctx.organizationId,
          clientId,
          deletedAt: null,
          ...(ownerId ? { assignedToId: ownerId } : {}),
        },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          source: true,
          procedureInterest: true,
          tags: true,
          createdAt: true,
          stageId: true,
          position: true,
          appointmentId: true,
          // Retorno esperado do paciente (reforma da retenção) — o card de retenção
          // mostra "retorno em {data}" / "atrasado há Nd". Null fora da retenção.
          patient: { select: { nextReturnDueAt: true } },
        },
      },
    },
  })
}

export async function findLeadById(ctx: TenantContext, clientId: string, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
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
    procedureInterestIds?: string[]
    estimatedValue?: number
    notes?: string
    tags?: string[]
  }
) {
  // Procedimentos de interesse estruturados: valida que são da clínica, deriva o
  // rótulo (nomes) e — se o valor estimado não veio — soma os preços.
  let procedureInterest = data.procedureInterest
  let estimatedValue = data.estimatedValue
  const ids = data.procedureInterestIds ?? []
  if (ids.length > 0) {
    const procs = await prisma.procedure.findMany({
      where: { id: { in: ids }, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true, price: true },
    })
    if (procs.length > 0) {
      procedureInterest = procs.map((p) => p.name).join(', ')
      if (estimatedValue == null) {
        estimatedValue = procs.reduce((sum, p) => sum + Number(p.price), 0)
      }
    }
  }

  return prisma.lead.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      source: data.source,
      stageId: data.stageId,
      procedureInterest,
      procedureInterestIds: ids,
      estimatedValue,
      notes: data.notes,
      tags: data.tags ?? [],
      // Item 4: dono = criador por padrão (reatribuível depois).
      assignedToId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  })
}

/**
 * Cria um card no funil EXISTING a partir de um paciente já cadastrado. O card
 * continua sendo um `Lead` (reusa board/dnd/actions), mas com `patientId` setado
 * e dados copiados do paciente. `source` fixo em WALK_IN (cliente já presente).
 */
export async function createLeadForPatient(
  ctx: TenantContext,
  clientId: string,
  patientId: string,
  stageId: string
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: { name: true, phone: true, email: true },
  })
  if (!patient) return null

  return prisma.lead.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      source: 'WALK_IN',
      stageId,
      patientId,
      assignedToId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  })
}

/**
 * Pacientes da clínica que ainda não têm um card ativo no funil EXISTING.
 * Usado pelo dialog de "adicionar cliente" para não duplicar cards.
 */
export async function listPatientsWithoutExistingCard(ctx: TenantContext, clientId: string) {
  return prisma.patient.findMany({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      leads: {
        none: {
          deletedAt: null,
          stage: { pipeline: { kind: 'RETENTION' } },
        },
      },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true },
  })
}

export async function updateLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
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
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { ...data, updatedById: ctx.userId },
  })
}

export async function moveLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  stageId: string,
  position?: number
) {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } })

  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      stageId,
      ...(position !== undefined ? { position } : {}),
      updatedById: ctx.userId,
      ...(stage?.isWon ? { closedAt: new Date() } : {}),
      ...(stage?.isLost ? { lostAt: new Date() } : {}),
    },
  })
}

export async function reorderLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  position: number
) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { position, updatedById: ctx.userId },
  })
}

/** Item 4: reatribui o dono de um lead (assignedToId). clientId no where (belt). */
export async function reassignLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  assignedToId: string
) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { assignedToId, updatedById: ctx.userId },
  })
}

export async function softDeleteLead(ctx: TenantContext, leadId: string, clientId: string) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
