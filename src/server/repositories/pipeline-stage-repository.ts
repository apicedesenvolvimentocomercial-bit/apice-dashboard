import type { StageNativeKey } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

// Ordem canônica das etapas nativas (Fase 2). A subsequência das etapas com
// `nativeKey` precisa respeitar isto após qualquer reordenação — o usuário pode
// mover etapas LIVRES entre elas, mas nunca pôr Lead à frente de Agendado etc.
const NATIVE_KEY_RANK: Record<StageNativeKey, number> = {
  LEAD: 0,
  SCHEDULED: 1,
  ATTENDED: 2,
  CLOSED: 3,
  NO_SHOW: 4,
  ACTIVE: 0,
  INACTIVE: 1,
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
  data: { name: string; color?: string | null }
) {
  // Garante que a pipeline pertence à org antes de inserir; pega o clientId dela.
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, organizationId: ctx.organizationId },
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
  data: { name?: string; color?: string | null }
) {
  return prisma.pipelineStage.updateMany({
    where: { id: stageId, pipeline: { organizationId: ctx.organizationId } },
    data,
  })
}

/**
 * Reordena as etapas de uma pipeline. Recebe a ordem final de ids e aplica
 * `order` 0..n. Para evitar colisão no unique (pipelineId, order) durante a
 * troca, joga primeiro para um offset alto e depois assenta.
 */
export async function reorderStages(ctx: TenantContext, pipelineId: string, orderedIds: string[]) {
  const owned = await prisma.pipelineStage.findMany({
    where: { pipelineId, pipeline: { organizationId: ctx.organizationId } },
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

  await prisma.$transaction([
    ...ids.map((id, i) =>
      prisma.pipelineStage.update({ where: { id }, data: { order: i + 1000 } })
    ),
    ...ids.map((id, i) => prisma.pipelineStage.update({ where: { id }, data: { order: i } })),
  ])
  return { ok: true as const }
}

/**
 * Exclui uma etapa. Bloqueia se for nativa (`isNative`) ou se ainda houver leads
 * (não-deletados) nela. Retorna flags para a action traduzir em mensagem.
 */
export async function deleteStage(ctx: TenantContext, stageId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, pipeline: { organizationId: ctx.organizationId } },
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
