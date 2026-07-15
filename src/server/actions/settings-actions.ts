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
import { enterClientScope } from '@/server/tenant/client-scope'
import { ConflictError, fail, ForbiddenError, ok, runAction } from '@/types/errors'

const updateOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nome muito curto')
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    ),
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
  name: z
    .string()
    .trim()
    .min(2, 'Nome muito curto')
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    ),
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
    currentPassword: z
      .string()
      .min(6, 'Senha atual obrigatória')
      .max(100, 'Senha antiga muito grande'),
    newPassword: z
      .string()
      .min(8, 'Nova senha deve ter pelo menos 8 caracteres')
      .max(100, 'Senha nova muito grande'),
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
  // Bump de sessionVersion invalida TODAS as sessões existentes (inclusive a
  // atual — o form redireciona p/ novo login). Trocar a senha deve derrubar
  // qualquer token vazado na hora, não só mudar a credencial.
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  })
  logger.info('Password changed', { userId: ctx.userId })

  return ok(null)
}

const updateClinicSettingsSchema = z.object({
  clientId: z.string().cuid(),
  name: z
    .string()
    .min(2)
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    )
    .optional(),
  phone: z
    .string()
    .length(12, 'Telefone inválido')
    .regex(/^[1-9]{2}\s?9\d{8}$/, 'Telefone inválido')
    .optional(),
  email: z
    .string()
    .max(255, 'Email de tamanho inválido')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email com formato inválido')
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  city: z
    .string()
    .max(255, 'Nome da cidade muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome da cidade contém caracteres inválidos'
    )
    .optional(),
  state: z
    .string()
    .max(2, 'Sigla do estado fora de padrão')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'A sigla do estado contém caracteres inválidos'
    )
    .optional(),
  notes: z
    .string()
    .max(65535, 'Nota muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'Nota contém caracteres inválidos'
    )
    .optional(),
  taxRegime: z.enum(['SIMPLES', 'PRESUMIDO', 'REAL']).optional(),
  cnae: z.string().optional(),
})

export async function updateClinicSettingsAction(
  input: z.infer<typeof updateClinicSettingsSchema>
) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    const parsed = updateClinicSettingsSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { clientId, email, cnae, ...rest } = parsed.data
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId) // suspenders: RLS ativa p/ esta clínica (rls-gambiarra)
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
      // '' (opção "Não informar") vira null no banco.
      cnae: cnae ? cnae : null,
    })
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: clientId,
      changes: { ...rest, cnae: cnae ?? null },
    }).catch(() => {})

    revalidatePath('/configuracoes') // dados da clínica vivem no domínio clínica (Fase 7)
    revalidatePath(`/clients/${clientId}/overview`)
    return null
  })
}

// Config de recebimento no crédito (modo + faixas de taxa de antecipação). Só o
// TITULAR altera — é um termo do contrato com a adquirente que muda como o
// financeiro lança contas a receber e despesa financeira. Ver lib/credit-fee.ts.
const creditFeeTierSchema = z
  .object({
    min: z.number().int().min(1, 'Parcela mínima ≥ 1').max(99),
    max: z.number().int().min(1).max(99),
    pct: z.number().min(0, 'Taxa ≥ 0').max(100, 'Taxa ≤ 100%'),
  })
  .refine((t) => t.max >= t.min, { message: 'Parcela final deve ser ≥ inicial', path: ['max'] })

const updateCreditReceiptConfigSchema = z.object({
  creditReceiptMode: z.enum(['INSTALLMENTS', 'UPFRONT_FEE']),
  creditFeeTiers: z.array(creditFeeTierSchema).max(20).default([]),
})

export async function updateCreditReceiptConfigAction(
  input: z.infer<typeof updateCreditReceiptConfigSchema>
) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'settings', 'write')
    if (!ctx.isOwner) {
      throw new ForbiddenError('Apenas o titular da clínica pode alterar o recebimento no crédito')
    }

    const parsed = updateCreditReceiptConfigSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // Em modo parcelado (INSTALLMENTS) as faixas são irrelevantes — zera p/ não
    // confundir leituras futuras.
    const tiers = parsed.data.creditReceiptMode === 'UPFRONT_FEE' ? parsed.data.creditFeeTiers : []

    await updateClient(ctx, ctx.clientId, {
      creditReceiptMode: parsed.data.creditReceiptMode,
      creditFeeTiers: tiers,
    })
    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: ctx.clientId,
      changes: { creditReceiptMode: parsed.data.creditReceiptMode, creditFeeTiers: tiers },
    }).catch(() => {})

    revalidatePath('/configuracoes')
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
