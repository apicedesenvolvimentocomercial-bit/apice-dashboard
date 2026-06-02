'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/prisma'
import { getClinicContext } from '@/server/auth/clinic-context'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { generateWebhookToken } from '@/server/services/webhook-auth'
import { ForbiddenError, runAction } from '@/types/errors'

/**
 * (Re)gera o token de webhook da clínica (SEC-003·B). Só o TITULAR — é credencial de
 * integração. Retorna o token CRU uma única vez (depois só fica o hash). Regenerar
 * invalida o token anterior. `clientId` no where (belt) + escopo já fixado por
 * getClinicContext (RLS — Client está fora dela, mas o padrão se mantém).
 */
export async function regenerateWebhookTokenAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    if (!ctx.isOwner) {
      throw new ForbiddenError('Apenas o titular da clínica pode gerenciar o webhook')
    }
    const { token, hash } = generateWebhookToken()
    await prisma.client.update({
      where: { id: ctx.clientId },
      data: { webhookTokenHash: hash },
    })
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: ctx.clientId,
      changes: { webhookToken: 'regenerated' },
    }).catch(() => {})
    revalidatePath('/configuracoes')
    return { token }
  })
}

/** Revoga o token (desabilita o webhook da clínica). Só o titular. */
export async function revokeWebhookTokenAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    if (!ctx.isOwner) {
      throw new ForbiddenError('Apenas o titular da clínica pode gerenciar o webhook')
    }
    await prisma.client.update({
      where: { id: ctx.clientId },
      data: { webhookTokenHash: null },
    })
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: ctx.clientId,
      changes: { webhookToken: 'revoked' },
    }).catch(() => {})
    revalidatePath('/configuracoes')
    return null
  })
}
