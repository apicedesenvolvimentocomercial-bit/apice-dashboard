'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  createPipeline,
  renamePipeline,
  deletePipeline,
} from '@/server/repositories/pipeline-repository'
import { createAuditLog } from '@/server/repositories/audit-repository'

function revalidate(clientId: string) {
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
}

const nameSchema = z.string().min(1, 'Nome obrigatório').max(60, 'Nome muito longo')

export async function createPipelineAction(clientId: string, name: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'crm', 'write')

  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Nome inválido')

  const result = await createPipeline(ctx, clientId, parsed.data)
  if (!result) return fail('Clínica não encontrada')
  if ('limit' in result) return fail('Limite de 6 pipelines atingido')

  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Pipeline',
    entityId: result.pipeline.id,
    changes: { name: result.pipeline.name },
  }).catch(() => {})
  revalidate(clientId)
  return ok({ id: result.pipeline.id })
}

export async function renamePipelineAction(pipelineId: string, clientId: string, name: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'write')

  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Nome inválido')

  await renamePipeline(ctx, pipelineId, clientId, parsed.data)
  revalidate(clientId)
  return ok(null)
}

export async function deletePipelineAction(pipelineId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'delete')

  const result = await deletePipeline(ctx, pipelineId, clientId)
  if (result.native) return fail('Pipelines nativas não podem ser excluídas')
  if (result.hasLeads) return fail('Mova ou remova os cards desta pipeline antes de excluí-la.')
  if (!result.deleted) return fail('Pipeline não encontrada')

  createAuditLog(ctx, {
    action: 'delete',
    entityType: 'Pipeline',
    entityId: pipelineId,
  }).catch(() => {})
  revalidate(clientId)
  return ok(null)
}
