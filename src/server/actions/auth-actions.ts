'use server'

import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { z } from 'zod'

import { EMAIL_FROM, resend } from '@/lib/resend'
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

  const user = await prisma.user.create({
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

  logger.info('Invite accepted', { userId: user.id, organizationId: invitation.organizationId })

  return ok({ email: user.email })
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export async function forgotPasswordAction(input: z.infer<typeof forgotPasswordSchema>) {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.message)

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email, deletedAt: null, isActive: true },
  })

  // Não revela se o email existe ou não (segurança)
  if (!user) return ok(null)

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60) // 1h

  // Armazena token na tabela Invitation reaproveitando como reset token
  // Em produção, criar tabela PasswordResetToken dedicada
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`

  if (resend) {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Recuperação de senha — KPI Clinic OS',
      html: `
        <p>Olá, ${user.name}!</p>
        <p>Clique no link abaixo para redefinir sua senha (válido por 1 hora):</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Se você não solicitou isso, ignore este email.</p>
      `,
    })
  } else {
    logger.warn('RESEND_API_KEY not set — reset email not sent', { resetUrl, expiresAt })
  }

  return ok(null)
}
