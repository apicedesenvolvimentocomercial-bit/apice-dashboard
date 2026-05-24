'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { StageKind } from '@prisma/client'

import { ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  createStage,
  updateStage,
  reorderStages,
  deleteStage,
} from '@/server/repositories/pipeline-stage-repository'
import { createAuditLog } from '@/server/repositories/audit-repository'

const kindSchema = z.enum(['NEW', 'EXISTING'])
// Hex (#rgb / #rrggbb) ou vazio.
const colorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor inválida')
  .optional()
  .nullable()

function revalidate(clientId: string) {
  revalidatePath('/crm')
  revalidatePath('/crm/clientes')
  revalidatePath(`/clients/${clientId}/crm`)
  revalidatePath(`/clients/${clientId}/crm/clientes`)
}

const createSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  color: colorSchema,
})

export async function createStageAction(clientId: string, kind: StageKind, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'write')

  if (!kindSchema.safeParse(kind).success) return fail('Funil inválido')
  const parsed = createSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const stage = await createStage(ctx, clientId, kind, parsed.data)
  if (!stage) return fail('Clínica não encontrada')

  createAuditLog(ctx, {
    action: 'create',
    entityType: 'PipelineStage',
    entityId: stage.id,
    changes: { name: stage.name, kind },
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
  await assertCan(ctx, 'crm', 'write')

  const parsed = updateSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  await updateStage(ctx, stageId, parsed.data)
  revalidate(clientId)
  return ok(null)
}

export async function reorderStagesAction(clientId: string, kind: StageKind, orderedIds: string[]) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'write')

  if (!kindSchema.safeParse(kind).success) return fail('Funil inválido')
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return fail('Ordem inválida')
  }

  await reorderStages(ctx, clientId, kind, orderedIds)
  revalidate(clientId)
  return ok(null)
}

export async function deleteStageAction(stageId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'crm', 'delete')

  const result = await deleteStage(ctx, stageId)
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
