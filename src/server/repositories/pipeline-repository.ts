import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

/**
 * CRUD das pipelines (funis) de uma clínica. Cada clínica tem ≤6 pipelines.
 * Duas são nativas (COMMERCIAL/RETENTION) e não podem ser excluídas. Pipeline
 * carrega `organizationId` desnormalizado — escopa via `client.organizationId`
 * para a barreira de org no nível do repo (SEC-002).
 */

export const MAX_PIPELINES = 6

// Etapas nativas semeadas para cada pipeline nativa. `isNative` impede exclusão
// (recebem função de negócio na Fase 2). Pipelines CUSTOM nascem com 0 etapas.
export const COMMERCIAL_NATIVE_STAGES = [
  {
    name: 'Lead',
    order: 0,
    color: '#6366f1',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'LEAD' as const,
  },
  {
    name: 'Agendado',
    order: 1,
    color: '#f59e0b',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'SCHEDULED' as const,
  },
  {
    name: 'Compareceu',
    order: 2,
    color: '#3b82f6',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'ATTENDED' as const,
  },
  {
    name: 'Fechado',
    order: 3,
    color: '#10b981',
    isWon: true,
    isLost: false,
    isNative: true,
    nativeKey: 'CLOSED' as const,
  },
  {
    // "Cancelado" abrange no-show E cancelamento comum; o sistema decide qual,
    // pela janela de cancelamento da clínica (Client.noShowWindowHours). Mantém
    // nativeKey NO_SHOW (identidade estável da etapa) — só o rótulo mudou.
    name: 'Cancelado',
    order: 4,
    color: '#ef4444',
    isWon: false,
    isLost: true,
    isNative: true,
    nativeKey: 'NO_SHOW' as const,
  },
] as const

export const RETENTION_NATIVE_STAGES = [
  {
    name: 'Ativo',
    order: 0,
    color: '#22c55e',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'ACTIVE' as const,
  },
  {
    name: 'Inativo',
    order: 1,
    color: '#94a3b8',
    isWon: false,
    isLost: false,
    isNative: true,
    nativeKey: 'INACTIVE' as const,
  },
] as const

/** Confirma que o client é da org do ctx. Retorna o id ou null. */
async function assertClientOfOrg(ctx: TenantContext, clientId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true },
  })
}

export async function listPipelines(ctx: TenantContext, clientId: string) {
  return prisma.pipeline.findMany({
    where: { clientId, organizationId: ctx.organizationId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, kind: true, order: true },
  })
}

/** Próximo `order` livre na clínica. */
async function nextPipelineOrder(clientId: string) {
  const last = await prisma.pipeline.findFirst({
    where: { clientId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  return (last?.order ?? -1) + 1
}

/**
 * Cria uma pipeline CUSTOM (sem etapas). Bloqueia em MAX_PIPELINES. Retorna
 * `{ limit: true }` quando estourou e `null` quando o client não é da org.
 */
export async function createPipeline(ctx: TenantContext, clientId: string, name: string) {
  const client = await assertClientOfOrg(ctx, clientId)
  if (!client) return null

  const count = await prisma.pipeline.count({ where: { clientId } })
  if (count >= MAX_PIPELINES) return { limit: true as const }

  const pipeline = await prisma.pipeline.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name,
      kind: 'CUSTOM',
      order: await nextPipelineOrder(clientId),
    },
    select: { id: true, name: true, kind: true, order: true },
  })
  return { pipeline }
}

export async function renamePipeline(
  ctx: TenantContext,
  pipelineId: string,
  clientId: string,
  name: string
) {
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.pipeline.updateMany({
    where: { id: pipelineId, clientId, organizationId: ctx.organizationId },
    data: { name },
  })
}

/**
 * Exclui uma pipeline. Bloqueia nativas (`COMMERCIAL`/`RETENTION`). Cascade
 * remove as etapas; os leads das etapas são apagados junto pela FK — por isso
 * bloqueamos se houver leads não-deletados. Retorna flags para a action.
 */
export async function deletePipeline(ctx: TenantContext, pipelineId: string, clientId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, clientId, organizationId: ctx.organizationId },
    select: {
      id: true,
      kind: true,
      stages: { select: { _count: { select: { leads: { where: { deletedAt: null } } } } } },
    },
  })
  if (!pipeline) return { deleted: false, native: false, hasLeads: false }
  if (pipeline.kind !== 'CUSTOM') return { deleted: false, native: true, hasLeads: false }

  const hasLeads = pipeline.stages.some((s) => s._count.leads > 0)
  if (hasLeads) return { deleted: false, native: false, hasLeads: true }

  await prisma.pipeline.delete({ where: { id: pipelineId } })
  return { deleted: true, native: false, hasLeads: false }
}

/**
 * Semeia as duas pipelines nativas para uma clínica nova. Idempotente: só cria
 * o que falta. Chamada na criação da clínica e sob demanda (clínicas legadas
 * já têm via migration).
 */
export async function ensureNativePipelines(clientId: string, organizationId: string) {
  const existing = await prisma.pipeline.findMany({
    where: { clientId, kind: { in: ['COMMERCIAL', 'RETENTION'] } },
    select: { kind: true },
  })
  const have = new Set(existing.map((p) => p.kind))

  if (!have.has('COMMERCIAL')) {
    await prisma.pipeline.create({
      data: {
        organizationId,
        clientId,
        name: 'Comercial',
        kind: 'COMMERCIAL',
        order: 0,
        stages: { create: COMMERCIAL_NATIVE_STAGES.map((s) => ({ ...s, clientId })) },
      },
    })
  }
  if (!have.has('RETENTION')) {
    await prisma.pipeline.create({
      data: {
        organizationId,
        clientId,
        name: 'Retenção',
        kind: 'RETENTION',
        order: 1,
        stages: { create: RETENTION_NATIVE_STAGES.map((s) => ({ ...s, clientId })) },
      },
    })
  }
}
