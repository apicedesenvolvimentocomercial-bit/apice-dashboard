'use server'

import { compare, hash } from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { generateWebhookToken } from '@/lib/webhook-token'
import { assertCan } from '@/server/auth/assert-can'
import { getClinicContext } from '@/server/auth/clinic-context'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { updateOrganization } from '@/server/repositories/organization-repository'
import { updateClient } from '@/server/repositories/client-repository'
import { updateUserProfile } from '@/server/repositories/user-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { ConflictError, fail, ForbiddenError, ok, runAction } from '@/types/errors'

const updateOrgSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto'),
})

export async function updateOrganizationAction(input: z.infer<typeof updateOrgSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'settings', 'write')

    const parsed = updateOrgSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    await updateOrganization(ctx, parsed.data)
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      changes: parsed.data,
    }).catch(() => {})

    revalidatePath('/settings')
    return null
  })
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto'),
})

export async function updateProfileAction(input: z.infer<typeof updateProfileSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()

    const parsed = updateProfileSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    await updateUserProfile(ctx.userId, parsed.data)
    logger.info('User profile updated', { userId: ctx.userId })

    // Perfil é compartilhado pelos dois domínios (Fase 7): admin em `/settings`,
    // clínica em `/configuracoes`. Revalida ambos — só um existe por sessão.
    revalidatePath('/settings')
    revalidatePath('/configuracoes')
    return null
  })
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, 'Senha atual obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['newPassword'],
  })

export async function changePasswordAction(input: z.infer<typeof changePasswordSchema>) {
  const ctx = await getTenantContext()

  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { passwordHash: true },
  })
  if (!user?.passwordHash) return fail('Conta sem senha definida')

  const valid = await compare(parsed.data.currentPassword, user.passwordHash)
  if (!valid) return fail('Senha atual incorreta')

  const passwordHash = await hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash },
  })
  logger.info('Password changed', { userId: ctx.userId })

  return ok(null)
}

const updateClinicSettingsSchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  city: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
})

export async function updateClinicSettingsAction(
  input: z.infer<typeof updateClinicSettingsSchema>
) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    const parsed = updateClinicSettingsSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { clientId, email, ...rest } = parsed.data
    await assertClientAccess(ctx, clientId)
    await assertCan(ctx, 'settings', 'write')

    // Dados sensíveis da clínica (nome, email, cidade, telefone, estado) só o
    // TITULAR altera (Etapa 1 — D9), mesmo que outro cargo tenha settings:write.
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { ownerId: true },
    })
    if (client?.ownerId !== ctx.userId) {
      throw new ForbiddenError('Apenas o titular da clínica pode alterar os dados da clínica')
    }

    await updateClient(ctx, clientId, {
      ...rest,
      email: email || undefined,
    })
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: clientId,
      changes: rest,
    }).catch(() => {})

    revalidatePath('/configuracoes') // dados da clínica vivem no domínio clínica (Fase 7)
    revalidatePath(`/clients/${clientId}/overview`)
    return null
  })
}

/**
 * Gera/rotaciona o token de webhook POR-CLÍNICA (seguranca-pendencias #2). Só o
 * TITULAR (coroa) gerencia — é um segredo de integração. Guarda só o sha256 e
 * retorna o token CRU UMA única vez (depois só o hash existe, irrecuperável).
 */
export async function rotateWebhookTokenAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'settings', 'write')
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
      changes: { webhookToken: 'rotated' },
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return { token }
  })
}

/** Revoga o token de webhook (desabilita a ingestão por webhook da clínica). */
export async function revokeWebhookTokenAction() {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'settings', 'write')
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
