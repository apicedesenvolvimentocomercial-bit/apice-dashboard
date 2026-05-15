'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { EMAIL_FROM, resend } from '@/lib/resend'
import { assertCan } from '@/server/auth/assert-can'
import { createAuditLog } from '@/server/repositories/audit-repository'
import {
  setUserActive,
  updateUserRole,
  upsertUserPermissions,
} from '@/server/repositories/user-repository'
import { getTenantContext } from '@/server/tenant/context'
import { ConflictError, NotFoundError, runAction } from '@/types/errors'

const ROLE_VALUES = ['ADMIN', 'STAFF'] as const

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
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

    const pending = await prisma.invitation.findFirst({
      where: {
        email,
        organizationId: ctx.organizationId,
        clientId: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
    if (pending) throw new ConflictError('Já existe um convite pendente para este email')

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

    if (resend) {
      const { InviteEmail } = await import('@/emails/invite-email')
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: 'Convite para a equipe — KPI Clinic OS',
        react: InviteEmail({ clinicName: 'a equipe', inviteUrl }),
      })
    } else {
      logger.warn('RESEND_API_KEY not set — staff invite email not sent', { inviteUrl })
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

const permissionItemSchema = z.object({
  module: z.string().min(1),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canDelete: z.boolean(),
})

const updatePermissionsSchema = z.object({
  userId: z.string().cuid(),
  permissions: z.array(permissionItemSchema).min(1),
})

export async function updateStaffPermissionsAction(input: z.infer<typeof updatePermissionsSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = updatePermissionsSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const target = await prisma.user.findFirst({
      where: {
        id: parsed.data.userId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      select: { id: true, role: true },
    })
    if (!target) throw new NotFoundError('Funcionário')
    if (target.role === 'ADMIN') {
      throw new ConflictError('ADMIN possui acesso total e não usa matriz')
    }

    await upsertUserPermissions(parsed.data.userId, parsed.data.permissions)

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'UserPermission',
      entityId: parsed.data.userId,
      changes: { permissions: parsed.data.permissions },
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}
