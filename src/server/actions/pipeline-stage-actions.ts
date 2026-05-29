'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
} from '@/server/repositories/pipeline-stage-repository'
import { createAuditLog } from '@/server/repositories/audit-repository'

// Hex (#rgb / #rrggbb) ou vazio.
const colorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor inválida')
  .optional()
  .nullable()

function revalidate(clientId: string) {
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
}

const createSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  color: colorSchema,
})

export async function createStageAction(pipelineId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'crm', 'write')

  const parsed = createSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const stage = await createStage(ctx, pipelineId, clientId, parsed.data)
  if (!stage) return fail('Pipeline não encontrada')

  createAuditLog(ctx, {
    action: 'create',
    entityType: 'PipelineStage',
    entityId: stage.id,
    changes: { name: stage.name, pipelineId },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ id: stage.id })
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: colorSchema,
})

export async function updateStageAction(stageId: string, clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const parsed = updateSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateStage(ctx, stageId, clientId, parsed.data)
  revalidate(clientId)
  return ok(null)
}

export async function reorderStagesAction(
  pipelineId: string,
  clientId: string,
  orderedIds: string[]
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return fail('Ordem inválida')
  }

  const result = await reorderStages(ctx, pipelineId, clientId, orderedIds)
  if (!result.ok)
    return fail('As etapas nativas têm ordem fixa e não podem ser reordenadas entre si.')
  revalidate(clientId)
  return ok(null)
}

export async function deleteStageAction(stageId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'delete')

  const result = await deleteStage(ctx, stageId, clientId)
  if (result.native) return fail('Esta etapa é nativa e não pode ser excluída.')
  if (result.blocked) return fail('Mova os cards desta etapa antes de excluí-la.')
  if (!result.deleted) return fail('Etapa não encontrada')

  createAuditLog(ctx, {
    action: 'delete',
    entityType: 'PipelineStage',
    entityId: stageId,
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
