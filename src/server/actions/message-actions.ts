'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { prisma } from '@/lib/prisma'

const updateTemplateSchema = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(1, 'Mensagem obrigatória').max(2000),
  isActive: z.boolean(),
})

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
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

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
