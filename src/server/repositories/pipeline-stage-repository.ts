import type { StageNativeKey } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

// Ordem canônica das etapas nativas (Fase 2). A subsequência das etapas com
// `nativeKey` precisa respeitar isto após qualquer reordenação — o usuário pode
// mover etapas LIVRES entre elas, mas nunca pôr Lead à frente de Agendado etc.
const NATIVE_KEY_RANK: Record<StageNativeKey, number> = {
  LEAD: 0,
  SCHEDULED: 1,
  ATTENDED: 2,
  CLOSED: 3,
  NO_SHOW: 4,
  // Retenção legado (pré-reforma) — só p/ pipelines ainda não migradas.
  ACTIVE: 0,
  INACTIVE: 1,
  // Ciclo de vida do paciente (reforma da retenção). Ranks 0–4 dentro do funil
  // de RETENÇÃO; não colidem com o comercial (funis distintos).
  POST_CARE: 0,
  NURTURE: 1,
  REACTIVATION: 2,
  LOYALTY: 3,
  WINBACK: 4,
}

/**
 * CRUD das etapas (PipelineStage) de uma pipeline. PipelineStage carrega
 * `clientId` mas escopa via `pipeline.client.organizationId` para a barreira de
 * org no nível do repo (SEC-002). Etapas nativas (`isNative`) não podem ser
 * excluídas — recebem função de negócio.
 */

/** Próximo `order` livre na pipeline. */
async function nextOrder(pipelineId: string) {
  const last = await prisma.pipelineStage.findFirst({
    where: { pipelineId },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  return (last?.order ?? -1) + 1
}

export async function createStage(
  ctx: TenantContext,
  pipelineId: string,
  clientId: string,
  data: { name: string; color?: string | null }
) {
  // Garante que a pipeline pertence à clínica (belt) antes de inserir.
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, clientId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  })
  if (!pipeline) return null

  return prisma.pipelineStage.create({
    data: {
      pipelineId,
      clientId: pipeline.clientId,
      name: data.name,
      color: data.color ?? null,
      order: await nextOrder(pipelineId),
    },
  })
}

export async function updateStage(
  ctx: TenantContext,
  stageId: string,
  clientId: string,
  data: { name?: string; color?: string | null }
) {
  return prisma.pipelineStage.updateMany({
    where: { id: stageId, clientId, pipeline: { organizationId: ctx.organizationId } },
    data,
  })
}

/**
 * Reordena as etapas de uma pipeline. Recebe a ordem final de ids e aplica
 * `order` 0..n. Para evitar colisão no unique (pipelineId, order) durante a
 * troca, joga primeiro para um offset alto e depois assenta.
 */
export async function reorderStages(
  ctx: TenantContext,
  pipelineId: string,
  clientId: string,
  orderedIds: string[]
) {
  const owned = await prisma.pipelineStage.findMany({
    where: { pipelineId, clientId, pipeline: { organizationId: ctx.organizationId } },
    select: { id: true, nativeKey: true },
  })
  const ownedSet = new Set(owned.map((s) => s.id))
  const ids = orderedIds.filter((id) => ownedSet.has(id))

  // Trava de ordem nativa: a subsequência das etapas com nativeKey, na ordem
  // proposta, precisa estar em rank crescente. Retorna sem persistir se violar.
  const keyById = new Map(owned.map((s) => [s.id, s.nativeKey]))
  const proposedRanks = ids
    .map((id) => keyById.get(id))
    .filter((k): k is StageNativeKey => k != null)
    .map((k) => NATIVE_KEY_RANK[k])
  for (let i = 1; i < proposedRanks.length; i++) {
    if (proposedRanks[i] <= proposedRanks[i - 1]) {
      return { ok: false as const }
    }
  }

  // scopedTransaction (não $transaction cru): sob escopo de clínica a extensão de
  // RLS embrulharia cada update → tx aninhada. Mantém RLS + atomicidade (F3).
  await scopedTransaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.pipelineStage.update({ where: { id: ids[i] }, data: { order: i + 1000 } })
    }
    for (let i = 0; i < ids.length; i++) {
      await tx.pipelineStage.update({ where: { id: ids[i] }, data: { order: i } })
    }
  })
  return { ok: true as const }
}

/**
 * Exclui uma etapa. Bloqueia se for nativa (`isNative`) ou se ainda houver leads
 * (não-deletados) nela. Retorna flags para a action traduzir em mensagem.
 */
export async function deleteStage(ctx: TenantContext, stageId: string, clientId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, clientId, pipeline: { organizationId: ctx.organizationId } },
    select: {
      id: true,
      isNative: true,
      _count: { select: { leads: { where: { deletedAt: null } } } },
    },
  })
  if (!stage) return { deleted: false, blocked: false, native: false }
  if (stage.isNative) return { deleted: false, blocked: false, native: true }
  if (stage._count.leads > 0) return { deleted: false, blocked: true, native: false }

  await prisma.pipelineStage.delete({ where: { id: stageId } })
  return { deleted: true, blocked: false, native: false }
}
