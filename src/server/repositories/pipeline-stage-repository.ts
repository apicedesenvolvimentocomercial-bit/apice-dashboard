import type { StageKind } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

/**
 * CRUD das etapas (PipelineStage) de um funil. PipelineStage não tem
 * organizationId próprio, então toda operação escopa via `client.organizationId`
 * para manter a barreira de org no nível do repo (SEC-002).
 */

/** Próximo `order` livre no funil (clientId, kind). */
async function nextOrder(clientId: string, kind: StageKind) {
  const last = await prisma.pipelineStage.findFirst({
    where: { clientId, kind },
    orderBy: { order: 'desc' },
    select: { order: true },
  })
  return (last?.order ?? -1) + 1
}

export async function createStage(
  ctx: TenantContext,
  clientId: string,
  kind: StageKind,
  data: { name: string; color?: string | null }
) {
  // Garante que o client pertence à org antes de inserir.
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true },
  })
  if (!client) return null

  return prisma.pipelineStage.create({
    data: {
      clientId,
      kind,
      name: data.name,
      color: data.color ?? null,
      order: await nextOrder(clientId, kind),
    },
  })
}

export async function updateStage(
  ctx: TenantContext,
  stageId: string,
  data: { name?: string; color?: string | null }
) {
  return prisma.pipelineStage.updateMany({
    where: { id: stageId, client: { organizationId: ctx.organizationId } },
    data,
  })
}

/**
 * Reordena um conjunto de stages de um funil. Recebe a ordem final de ids e
 * aplica `order` 0..n. Para evitar colisão no unique (clientId, kind, order)
 * durante a troca, joga primeiro para um offset alto e depois assenta.
 */
export async function reorderStages(
  ctx: TenantContext,
  clientId: string,
  kind: StageKind,
  orderedIds: string[]
) {
  // Só mexe em stages que de fato pertencem a este funil/org.
  const owned = await prisma.pipelineStage.findMany({
    where: { clientId, kind, client: { organizationId: ctx.organizationId } },
    select: { id: true },
  })
  const ownedSet = new Set(owned.map((s) => s.id))
  const ids = orderedIds.filter((id) => ownedSet.has(id))

  await prisma.$transaction([
    // Fase 1: desloca todos para fora da faixa final (evita unique clash).
    ...ids.map((id, i) =>
      prisma.pipelineStage.update({ where: { id }, data: { order: i + 1000 } })
    ),
    // Fase 2: assenta 0..n.
    ...ids.map((id, i) => prisma.pipelineStage.update({ where: { id }, data: { order: i } })),
  ])
}

/**
 * Exclui uma stage. Bloqueia se ainda houver leads (não-deletados) nela —
 * o caller deve mover/limpar os cards antes. Retorna `{ blocked: true }` nesse
 * caso para a action traduzir em mensagem.
 */
export async function deleteStage(ctx: TenantContext, stageId: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, client: { organizationId: ctx.organizationId } },
    select: { id: true, _count: { select: { leads: { where: { deletedAt: null } } } } },
  })
  if (!stage) return { deleted: false, blocked: false }
  if (stage._count.leads > 0) return { deleted: false, blocked: true }

  await prisma.pipelineStage.delete({ where: { id: stageId } })
  return { deleted: true, blocked: false }
}
