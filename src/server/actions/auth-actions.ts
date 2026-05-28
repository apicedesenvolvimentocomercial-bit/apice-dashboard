'use server'

import { hash } from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'

import { env } from '@/lib/env'
import { sendEmail } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { fail, ok } from '@/types/errors'

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2),
  password: z.string().min(8),
})

export async function acceptInviteAction(input: z.infer<typeof acceptInviteSchema>) {
  const parsed = acceptInviteSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.message)

  const { token, name, password } = parsed.data

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: true },
  })

  if (!invitation) return fail('Token de convite inválido')
  if (invitation.acceptedAt) return fail('Este convite já foi utilizado')
  if (invitation.expiresAt < new Date()) return fail('Convite expirado')

  const passwordHash = await hash(password, 12)

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true, deletedAt: true },
  })
  if (existing && !existing.deletedAt) return fail('Já existe uma conta ativa com este email')

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          role: invitation.role,
          isActive: true,
          deletedAt: null,
          organizationId: invitation.organizationId,
          clientId: invitation.clientId,
        },
      })
    : await prisma.user.create({
        data: {
          email: invitation.email,
          name,
          passwordHash,
          role: invitation.role,
          isActive: true,
          organizationId: invitation.organizationId,
          clientId: invitation.clientId,
        },
      })

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  })

  // Se a organização ainda não tem dono e o usuário entrou como ADMIN,
  // ele assume a titularidade automaticamente. Usa updateMany com filtro
  // por ownerId IS NULL para evitar race condition (dois ADMINs aceitando
  // convite simultaneamente — só o primeiro a executar vence).
  if (user.role === 'ADMIN' && invitation.organizationId) {
    const result = await prisma.organization.updateMany({
      where: { id: invitation.organizationId, ownerId: null },
      data: { ownerId: user.id },
    })
    if (result.count > 0) {
      logger.info('Organization owner auto-assigned on invite accept', {
        userId: user.id,
        organizationId: invitation.organizationId,
      })
    }
  }

  // Análogo para a CLÍNICA (Etapa 1 — cargos): o primeiro usuário interno que
  // entra como CLIENT_OWNER vira titular (coroa) da clínica, se ela ainda não
  // tem dono. Mesmo updateMany com filtro `ownerId: null` para evitar race.
  if (user.role === 'CLIENT_OWNER' && invitation.clientId) {
    const result = await prisma.client.updateMany({
      where: { id: invitation.clientId, ownerId: null },
      data: { ownerId: user.id },
    })
    if (result.count > 0) {
      logger.info('Clinic owner auto-assigned on invite accept', {
        userId: user.id,
        clientId: invitation.clientId,
      })
    }
  }

  logger.info('Invite accepted', { userId: user.id, organizationId: invitation.organizationId })

  return ok({ email: user.email })
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export async function forgotPasswordAction(input: z.infer<typeof forgotPasswordSchema>) {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.message)

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email, deletedAt: null, isActive: true },
    select: { id: true, email: true, name: true },
  })

  // Não revela se o email existe ou não (segurança).
  if (!user) return ok(null)

  // Token cru fica só no email + URL; o banco armazena somente o hash.
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60) // 1h

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`

  const { ResetPasswordEmail } = await import('@/emails/reset-password-email')
  const emailRes = await sendEmail({
    to: user.email,
    subject: 'Recuperação de senha — Senno',
    react: ResetPasswordEmail({ userName: user.name, resetUrl }),
  })
  if (!emailRes.ok) {
    logger.warn('Recuperação de senha: email não enviado', {
      resetUrl,
      expiresAt,
      error: emailRes.error,
    })
  }

  return ok(null)
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
})

export async function resetPasswordAction(input: z.infer<typeof resetPasswordSchema>) {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  const tokenHash = hashToken(parsed.data.token)

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  if (!record) return fail('Token inválido')
  if (record.usedAt) return fail('Token já utilizado')
  if (record.expiresAt < new Date()) return fail('Token expirado')

  const passwordHash = await hash(parsed.data.password, 12)

  // Atualiza senha e marca o token como usado em uma única transação para
  // evitar reuso em race condition.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])

  logger.info('Password reset', { userId: record.userId })
  return ok(null)
}
