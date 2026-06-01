import type { StageNativeKey } from '@prisma/client'

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

export async function listPipelines(
  ctx: TenantContext,
  clientId: string,
  // Item 4: pipelines pessoais. `null` = ver todas (admin/titular/viewAll).
  // userId = nativas (ownerId null, compartilhadas) + as EXTRAS desse usuário.
  viewerId: string | null = null
) {
  return prisma.pipeline.findMany({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      ...(viewerId ? { OR: [{ ownerId: null }, { ownerId: viewerId }] } : {}),
    },
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
      // Item 4: pipeline extra é PESSOAL — só o criador (e viewAll/titular) a vê.
      ownerId: ctx.userId,
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
 * já têm via migration). Também REPARA `nativeKey` faltando nas etapas nativas
 * (ver `ensureNativeStageKeys`) — sem isso o arrastar p/ Compareceu/Agendado não
 * dispara efeito, porque o board decide pela `nativeKey`.
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

  await ensureNativeStageKeys(clientId)
}

// Sequência canônica das etapas NATIVAS por tipo de pipeline. A ordem é estável:
// `reorderStages` proíbe quebrar a subsequência nativa, então a posição relativa
// entre as nativas SEMPRE bate com esta lista — base segura p/ reidratar a
// `nativeKey` (independe de isWon/isLost/nome, que podem ter driftado).
const COMMERCIAL_NATIVE_ORDER: StageNativeKey[] = [
  'LEAD',
  'SCHEDULED',
  'ATTENDED',
  'CLOSED',
  'NO_SHOW',
]
const RETENTION_NATIVE_ORDER: StageNativeKey[] = ['ACTIVE', 'INACTIVE']

/**
 * Preenche `nativeKey` em etapas NATIVAS que estão sem ele. Necessário para
 * clínicas legadas cujo backfill (migration) não tagueou a etapa — ex.: uma
 * etapa livre foi inserida e deslocou a `order`, então o `CASE order=N` não casou
 * e a nativa ficou com `nativeKey` nulo. Sem isso o board não dispara o efeito
 * (Compareceu não abre pop-up; Fechado não dá baixa financeira). Idempotente e
 * barato: só roda quando há nulo; só toca `isNative=true`; mapeia pela POSIÇÃO
 * RELATIVA entre as nativas contra a sequência canônica (robusto a etapas livres
 * E a isWon/isLost driftados).
 */
async function ensureNativeStageKeys(clientId: string) {
  const missing = await prisma.pipelineStage.count({
    where: {
      clientId,
      isNative: true,
      nativeKey: null,
      pipeline: { kind: { in: ['COMMERCIAL', 'RETENTION'] } },
    },
  })
  if (missing === 0) return

  const pipelines = await prisma.pipeline.findMany({
    where: { clientId, kind: { in: ['COMMERCIAL', 'RETENTION'] } },
    select: {
      kind: true,
      stages: {
        where: { isNative: true },
        orderBy: { order: 'asc' },
        select: { id: true, nativeKey: true },
      },
    },
  })

  const updates: { id: string; key: StageNativeKey }[] = []
  for (const p of pipelines) {
    const canonical = p.kind === 'COMMERCIAL' ? COMMERCIAL_NATIVE_ORDER : RETENTION_NATIVE_ORDER
    p.stages.forEach((st, idx) => {
      const want = canonical[idx]
      if (want && st.nativeKey == null) updates.push({ id: st.id, key: want })
    })
  }

  // clientId no where (belt) — não depende da RLS.
  for (const u of updates) {
    await prisma.pipelineStage.updateMany({
      where: { id: u.id, clientId },
      data: { nativeKey: u.key },
    })
  }
}
