'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/resend'
import { assertCan } from '@/server/auth/assert-can'
import { assertMutationBudget } from '@/server/security/mutation-throttle'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { setUserActive, updateUserRole } from '@/server/repositories/user-repository'
import { getTenantContext } from '@/server/tenant/context'
import { ConflictError, ForbiddenError, NotFoundError, runAction } from '@/types/errors'

const ROLE_VALUES = ['ADMIN', 'STAFF'] as const

const inviteSchema = z.object({
  email: z
    .string()
    .max(255, 'Email de tamanho inválido')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email com formato inválido')
    .email('Email inválido'),
  role: z.enum(ROLE_VALUES),
})

export async function inviteStaffAction(input: z.infer<typeof inviteSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = inviteSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { email, role } = parsed.data

    const existing = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    })
    if (existing) throw new ConflictError('Já existe um usuário com este email')

    await prisma.invitation.deleteMany({
      where: {
        email,
        organizationId: ctx.organizationId,
        clientId: null,
        acceptedAt: null,
      },
    })

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 dias

    const invitation = await prisma.invitation.create({
      data: {
        email,
        role,
        organizationId: ctx.organizationId,
        token,
        expiresAt,
        invitedById: ctx.userId,
      },
    })

    const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`

    const { InviteEmail } = await import('@/emails/invite-email')
    const emailRes = await sendEmail({
      to: email,
      subject: 'Convite para a equipe — Senno',
      react: InviteEmail({ clinicName: 'a equipe', inviteUrl }),
    })
    if (!emailRes.ok) {
      logger.warn('Convite de equipe: email não enviado', { inviteUrl, error: emailRes.error })
    }

    createAuditLog(ctx, {
      action: 'invite',
      entityType: 'Invitation',
      entityId: invitation.id,
      changes: { email, role },
    }).catch(() => {})

    revalidatePath('/staff')
    return { inviteUrl }
  })
}

const updateRoleSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(ROLE_VALUES),
})

export async function updateStaffRoleAction(input: z.infer<typeof updateRoleSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = updateRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    if (parsed.data.userId === ctx.userId) {
      throw new ConflictError('Você não pode alterar seu próprio cargo')
    }

    // O dono não pode ser rebaixado por terceiros — a única forma de
    // alguém deixar de ser dono é transferindo a titularidade.
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ownerId: true },
    })
    if (org?.ownerId === parsed.data.userId) {
      throw new ConflictError(
        'Este usuário é o dono da organização — só ele mesmo pode transferir a titularidade.'
      )
    }

    // "ADMIN não mexe em ADMIN" (ledger agency-roles D5 / mesmo nível): ADMINs
    // são todos o topo. Alterar o acesso total de quem JÁ é ADMIN (rebaixar) ou
    // promover alguém a ADMIN só o TITULAR pode — um ADMIN comum não rebaixa par.
    const isViewerOwner = org?.ownerId === ctx.userId
    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: ctx.organizationId, deletedAt: null },
      select: { role: true },
    })
    if (!target) throw new NotFoundError('Funcionário')
    const touchesAdmin = target.role === 'ADMIN' || parsed.data.role === 'ADMIN'
    if (touchesAdmin && !isViewerOwner) {
      throw new ConflictError('Apenas o titular pode conceder ou remover acesso total (ADMIN).')
    }

    const result = await updateUserRole(ctx, parsed.data.userId, parsed.data.role)
    if (result.count === 0) throw new NotFoundError('Funcionário')

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'User',
      entityId: parsed.data.userId,
      changes: { role: parsed.data.role },
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}

const setActiveSchema = z.object({
  userId: z.string().cuid(),
  isActive: z.boolean(),
})

export async function setStaffActiveAction(input: z.infer<typeof setActiveSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = setActiveSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    if (parsed.data.userId === ctx.userId) {
      throw new ConflictError('Você não pode desativar a si mesmo')
    }

    // Dono não pode ser desativado por terceiros (única forma de "remover":
    // ele transferir a titularidade primeiro, virar ADMIN comum, e então
    // pode ser desativado).
    if (!parsed.data.isActive) {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { ownerId: true },
      })
      if (org?.ownerId === parsed.data.userId) {
        throw new ConflictError(
          'O dono da organização não pode ser desativado. Transfira a titularidade primeiro.'
        )
      }
    }

    const result = await setUserActive(ctx, parsed.data.userId, parsed.data.isActive)
    if (result.count === 0) throw new NotFoundError('Funcionário')

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'User',
      entityId: parsed.data.userId,
      changes: { isActive: parsed.data.isActive },
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}

const transferOwnershipSchema = z.object({
  targetUserId: z.string().cuid(),
})

/**
 * Transfere a titularidade da organização para outro usuário.
 * - Apenas o dono atual pode invocar.
 * - O alvo precisa estar ativo e pertencer à mesma organização.
 * - Se o alvo é STAFF, é promovido a ADMIN na mesma transação.
 * - O dono atual permanece ADMIN, mas perde a coroa.
 */
export async function transferOwnershipAction(input: z.infer<typeof transferOwnershipSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    // Não passa por assertCan (gate = dono da org) → rate-limit explícito.
    await assertMutationBudget(ctx.userId)
    if (ctx.role !== 'ADMIN') {
      throw new ForbiddenError('Apenas ADMIN pode transferir titularidade')
    }

    const parsed = transferOwnershipSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    if (parsed.data.targetUserId === ctx.userId) {
      throw new ConflictError('Você já é o dono — escolha outro usuário')
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ownerId: true },
    })
    if (!org) throw new NotFoundError('Organização')
    if (org.ownerId !== ctx.userId) {
      throw new ForbiddenError('Apenas o dono atual pode transferir a titularidade')
    }

    const target = await prisma.user.findFirst({
      where: {
        id: parsed.data.targetUserId,
        organizationId: ctx.organizationId,
        deletedAt: null,
        isActive: true,
        role: { in: ['ADMIN', 'STAFF'] },
      },
      select: { id: true, name: true, role: true },
    })
    if (!target) {
      throw new NotFoundError('Funcionário-alvo (precisa estar ativo na organização)')
    }

    await prisma.$transaction([
      // Promove o alvo a ADMIN se ainda for STAFF (idempotente para ADMIN).
      prisma.user.update({
        where: { id: target.id },
        data: { role: 'ADMIN' },
      }),
      // Move a coroa atomicamente.
      prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { ownerId: target.id },
      }),
    ])

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      changes: {
        ownerId: { from: ctx.userId, to: target.id },
        promotedToAdmin: target.role === 'STAFF',
      },
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}
