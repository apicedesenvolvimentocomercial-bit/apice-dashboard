'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { env } from '@/lib/env'
import { sendEmail } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  createClient,
  softDeleteClient,
  updateClient,
} from '@/server/repositories/client-repository'
import { createDefaultPipelineStages } from '@/server/services/client-service'
import { assertCan } from '@/server/auth/assert-can'
import { getTenantContext } from '@/server/tenant/context'
import { ConflictError, NotFoundError, fail, ok, runAction } from '@/types/errors'
import { createAuditLog } from '@/server/repositories/audit-repository'

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  monthlyFee: z.coerce.number().positive().optional(),
  contractStart: z.string().optional(),
  notes: z.string().optional(),
})

export async function createClientAction(formData: z.infer<typeof createClientSchema>) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'clients', 'write')

  const parsed = createClientSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { name, city, state, phone, email, monthlyFee, contractStart, notes } = parsed.data

  const baseSlug = slugify(name)
  const existing = await prisma.client.findFirst({
    where: { organizationId: ctx.organizationId, slug: baseSlug, deletedAt: null },
  })
  if (existing) return fail(new ConflictError('Já existe uma clínica com esse nome'))

  const client = await createClient(ctx, {
    name,
    slug: baseSlug,
    city,
    state,
    phone,
    email: email || undefined,
    monthlyFee,
    contractStart: contractStart ? new Date(contractStart) : undefined,
    notes,
  })

  await createDefaultPipelineStages(client.id, ctx.organizationId)

  logger.info('Client created', { clientId: client.id, organizationId: ctx.organizationId })
  createAuditLog(ctx, {
    action: 'create',
    entityType: 'Client',
    entityId: client.id,
    changes: { name },
  }).catch(() => {})

  revalidatePath('/clients')
  return ok({ id: client.id })
}

const updateClientSchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().min(2).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  monthlyFee: z.coerce.number().positive().optional(),
  contractStart: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ONBOARDING', 'CHURNED']).optional(),
})

export async function updateClientAction(formData: z.infer<typeof updateClientSchema>) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'clients', 'write')

  const parsed = updateClientSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { clientId, contractStart, email, ...rest } = parsed.data

  await updateClient(ctx, clientId, {
    ...rest,
    email: email || undefined,
    contractStart: contractStart ? new Date(contractStart) : undefined,
  })
  createAuditLog(ctx, {
    action: 'update',
    entityType: 'Client',
    entityId: clientId,
    changes: rest,
  }).catch(() => {})

  return ok(null)
}

export async function deleteClientAction(clientId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'clients', 'delete')

    await softDeleteClient(ctx, clientId)
    logger.info('Client soft-deleted', { clientId, organizationId: ctx.organizationId })
    createAuditLog(ctx, { action: 'delete', entityType: 'Client', entityId: clientId }).catch(
      () => {}
    )
    return null
  })
}

const CLINIC_ROLES = ['CLIENT_OWNER', 'CLIENT_STAFF'] as const

const inviteClientOwnerSchema = z.object({
  clientId: z.string().cuid(),
  email: z.string().email('Email inválido'),
  role: z.enum(CLINIC_ROLES).optional(),
})

export async function inviteClientOwnerAction(formData: z.infer<typeof inviteClientOwnerSchema>) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'staff', 'write')

  const parsed = inviteClientOwnerSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { clientId, email, role = 'CLIENT_OWNER' } = parsed.data

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!client) return fail(new NotFoundError('Clínica'))

  const activeUser = await prisma.user.findFirst({
    where: { email, clientId, deletedAt: null },
    select: { id: true },
  })
  if (activeUser) {
    return fail(new ConflictError('Este usuário já faz parte desta clínica'))
  }

  await prisma.invitation.deleteMany({
    where: { email, clientId, acceptedAt: null },
  })

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 dias

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      organizationId: ctx.organizationId,
      clientId,
      token,
      expiresAt,
      invitedById: ctx.userId,
    },
  })

  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`

  const { InviteEmail } = await import('@/emails/invite-email')
  const inviteEmailRes = await sendEmail({
    to: email,
    subject: `Convite para gerenciar ${client.name} — Senno`,
    react: InviteEmail({ clinicName: client.name, inviteUrl }),
  })
  if (!inviteEmailRes.ok) {
    logger.warn('Convite de clínica: email não enviado', { inviteUrl, error: inviteEmailRes.error })
  }

  logger.info('Clinic user invited', { invitationId: invitation.id, clientId, email, role })

  revalidatePath(`/clients/${clientId}/users`)
  return ok({ inviteUrl })
}

const removeClinicUserSchema = z.object({
  clientId: z.string().cuid(),
  userId: z.string().cuid(),
})

export async function removeClinicUserAction(formData: z.infer<typeof removeClinicUserSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = removeClinicUserSchema.safeParse(formData)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { clientId, userId } = parsed.data

    if (userId === ctx.userId) {
      throw new ConflictError('Você não pode remover a si mesmo')
    }

    const target = await prisma.user.findFirst({
      where: {
        id: userId,
        clientId,
        organizationId: ctx.organizationId,
        role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
        deletedAt: null,
      },
      select: { id: true, email: true },
    })
    if (!target) throw new NotFoundError('Usuário')

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.session.deleteMany({ where: { userId } }),
    ])

    createAuditLog(ctx, {
      action: 'delete',
      entityType: 'User',
      entityId: userId,
      changes: { clientId, email: target.email },
    }).catch(() => {})

    logger.info('Clinic user removed', { userId, clientId })
    revalidatePath(`/clients/${clientId}/users`)
    return null
  })
}

const invitationIdSchema = z.object({
  invitationId: z.string().cuid(),
})

export async function resendClinicInvitationAction(formData: z.infer<typeof invitationIdSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = invitationIdSchema.safeParse(formData)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const invitation = await prisma.invitation.findFirst({
      where: {
        id: parsed.data.invitationId,
        organizationId: ctx.organizationId,
        acceptedAt: null,
      },
      include: { client: { select: { id: true, name: true } } },
    })
    if (!invitation) throw new NotFoundError('Convite')

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)

    const updated = await prisma.invitation.update({
      where: { id: invitation.id },
      data: { token, expiresAt },
    })

    const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`
    const clinicName = invitation.client?.name ?? 'a equipe'

    const { InviteEmail } = await import('@/emails/invite-email')
    const resendEmailRes = await sendEmail({
      to: invitation.email,
      subject: `Convite para gerenciar ${clinicName} — Senno`,
      react: InviteEmail({ clinicName, inviteUrl }),
    })
    if (!resendEmailRes.ok) {
      logger.warn('Reenvio de convite: email não enviado', {
        inviteUrl,
        error: resendEmailRes.error,
      })
    }

    logger.info('Clinic invitation resent', { invitationId: updated.id })
    if (invitation.clientId) revalidatePath(`/clients/${invitation.clientId}/users`)
    return { inviteUrl }
  })
}

export async function cancelClinicInvitationAction(formData: z.infer<typeof invitationIdSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'staff', 'write')

    const parsed = invitationIdSchema.safeParse(formData)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const invitation = await prisma.invitation.findFirst({
      where: {
        id: parsed.data.invitationId,
        organizationId: ctx.organizationId,
        acceptedAt: null,
      },
      select: { id: true, clientId: true },
    })
    if (!invitation) throw new NotFoundError('Convite')

    await prisma.invitation.delete({ where: { id: invitation.id } })

    logger.info('Clinic invitation canceled', { invitationId: invitation.id })
    if (invitation.clientId) revalidatePath(`/clients/${invitation.clientId}/users`)
    return null
  })
}
