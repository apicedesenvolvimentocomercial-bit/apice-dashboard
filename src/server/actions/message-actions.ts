'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail, validationFail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { prisma } from '@/lib/prisma'

const updateTemplateSchema = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(1, 'Mensagem obrigatória').max(2000),
  isActive: z.boolean(),
})

const operationModeSchema = z.enum(['MANUAL', 'AUTOMATED'])

/**
 * Define o modo de operação da clínica (MANUAL = toques viram tarefa; AUTOMATED =
 * envia mensagem quando o WhatsApp estiver integrado). Gateado por `settings:write`.
 */
export async function setOperationModeAction(clientId: string, mode: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'settings', 'write')

  const parsed = operationModeSchema.safeParse(mode)
  if (!parsed.success) return fail('Modo inválido')

  await prisma.client.updateMany({
    where: { id: clientId, organizationId: ctx.organizationId },
    data: { operationMode: parsed.data },
  })

  revalidatePath('/configuracoes')
  return ok(null)
}

/**
 * Edita um template de mensagem da clínica (título/corpo/ativo). Gateado por
 * `settings:write`. Belt: `clientId` no where (não confia só na RLS).
 */
export async function updateMessageTemplateAction(
  clientId: string,
  templateId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'settings', 'write')

  const parsed = updateTemplateSchema.safeParse(formData)
  if (!parsed.success) return validationFail(parsed.error)

  const res = await prisma.messageTemplate.updateMany({
    where: { id: templateId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      title: parsed.data.title || null,
      body: parsed.data.body,
      isActive: parsed.data.isActive,
    },
  })
  if (res.count === 0) return fail('Template não encontrado')

  revalidatePath('/configuracoes')
  return ok(null)
}
