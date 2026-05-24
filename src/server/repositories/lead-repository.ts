import type { LeadSource, StageKind } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>
export type FullLead = Awaited<ReturnType<typeof findLeadById>>

// Etapas iniciais do funil EXISTING, criadas sob demanda (ids cuid via
// createMany). Editáveis depois pelo usuário no editor de etapas.
const DEFAULT_EXISTING_STAGES = [
  { name: 'Ativo', order: 0, color: '#22c55e' },
  { name: 'Em tratamento', order: 1, color: '#f59e0b' },
  { name: 'Inativo', order: 2, color: '#94a3b8' },
]

/**
 * Garante que o funil EXISTING tenha etapas: se a clínica nunca o usou, cria as
 * defaults. Idempotente — `skipDuplicates` + checagem prévia evitam corrida no
 * unique (clientId, kind, order). Só roda para EXISTING (o NEW é semeado na
 * criação da clínica).
 */
async function ensureExistingStages(clientId: string) {
  const count = await prisma.pipelineStage.count({ where: { clientId, kind: 'EXISTING' } })
  if (count > 0) return
  await prisma.pipelineStage.createMany({
    data: DEFAULT_EXISTING_STAGES.map((s) => ({ ...s, clientId, kind: 'EXISTING' as const })),
    skipDuplicates: true,
  })
}

export async function getPipeline(ctx: TenantContext, clientId: string, kind: StageKind = 'NEW') {
  if (kind === 'EXISTING') {
    // Escopo de org garantido antes de semear: confirma que o client é da org.
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (client) await ensureExistingStages(clientId)
  }
  return prisma.pipelineStage.findMany({
    // PipelineStage não tem organizationId próprio; escopa via relação `client`
    // para garantir a barreira de org no nível do repo (SEC-002).
    where: { clientId, kind, client: { organizationId: ctx.organizationId } },
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
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          procedureInterest: true,
          tags: true,
          createdAt: true,
          stageId: true,
          position: true,
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
          stage: { kind: 'EXISTING' },
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

export async function moveLead(
  ctx: TenantContext,
  leadId: string,
  stageId: string,
  position?: number
) {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } })

  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      stageId,
      ...(position !== undefined ? { position } : {}),
      updatedById: ctx.userId,
      ...(stage?.isWon ? { closedAt: new Date() } : {}),
      ...(stage?.isLost ? { lostAt: new Date() } : {}),
    },
  })
}

export async function reorderLead(ctx: TenantContext, leadId: string, position: number) {
  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: { position, updatedById: ctx.userId },
  })
}

export async function softDeleteLead(ctx: TenantContext, leadId: string) {
  return prisma.lead.updateMany({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
