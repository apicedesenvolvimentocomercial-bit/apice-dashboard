'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { EMAIL_FROM, resend } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  createClient,
  softDeleteClient,
  updateClient,
} from '@/server/repositories/client-repository'
import { createDefaultPipelineStages } from '@/server/services/client-service'
import { getTenantContext } from '@/server/tenant/context'
import { ConflictError, ForbiddenError, NotFoundError, fail, ok } from '@/types/errors'

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
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') return fail(new ForbiddenError())

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

  await createDefaultPipelineStages(client.id)

  logger.info('Client created', { clientId: client.id, organizationId: ctx.organizationId })

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
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') return fail(new ForbiddenError())

  const parsed = updateClientSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { clientId, contractStart, email, ...rest } = parsed.data

  await updateClient(ctx, clientId, {
    ...rest,
    email: email || undefined,
    contractStart: contractStart ? new Date(contractStart) : undefined,
  })

  return ok(null)
}

export async function deleteClientAction(clientId: string) {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN') return fail(new ForbiddenError())

  await softDeleteClient(ctx, clientId)
  logger.info('Client soft-deleted', { clientId, organizationId: ctx.organizationId })

  return ok(null)
}

const inviteClientOwnerSchema = z.object({
  clientId: z.string().cuid(),
  email: z.string().email('Email inválido'),
})

export async function inviteClientOwnerAction(formData: z.infer<typeof inviteClientOwnerSchema>) {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') return fail(new ForbiddenError())

  const parsed = inviteClientOwnerSchema.safeParse(formData)
  if (!parsed.success) return fail(parsed.error.errors[0].message)

  const { clientId, email } = parsed.data

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!client) return fail(new NotFoundError('Clínica'))

  const existing = await prisma.invitation.findFirst({
    where: { email, clientId, acceptedAt: null, expiresAt: { gt: new Date() } },
  })
  if (existing) return fail(new ConflictError('Já existe um convite pendente para este email'))

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 dias

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role: 'CLIENT_OWNER',
      organizationId: ctx.organizationId,
      clientId,
      token,
      expiresAt,
      invitedById: ctx.userId,
    },
  })

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`

  if (resend) {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Convite para gerenciar ${client.name} — KPI Clinic OS`,
      html: `
        <p>Olá!</p>
        <p>Você foi convidado para gerenciar <strong>${client.name}</strong> no KPI Clinic OS.</p>
        <p>Clique no link abaixo para criar sua conta (válido por 7 dias):</p>
        <a href="${inviteUrl}">${inviteUrl}</a>
      `,
    })
  } else {
    logger.warn('RESEND_API_KEY not set — invite email not sent', { inviteUrl })
  }

  logger.info('Client owner invited', { invitationId: invitation.id, clientId, email })

  return ok({ inviteUrl })
}
