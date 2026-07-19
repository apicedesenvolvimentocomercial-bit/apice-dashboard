'use server'

import { hash } from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { z } from 'zod'

import { env } from '@/lib/env'
import { getIpFromHeaders } from '@/lib/request-ip'
import { sendEmail } from '@/lib/resend'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import {
  isResetAttemptLocked,
  isResetRequestLocked,
  recordResetRequest,
  recordResetTokenFailure,
} from '@/server/security/reset-throttle'
import { fail, ok } from '@/types/errors'

const acceptInviteSchema = z.object({
  token: z.string().min(1).max(500, 'Token inválido'),
  name: z
    .string()
    .min(2)
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O nome contém caracteres inválidos'
    ),
  password: z.string().min(8).max(100, 'Senha muito grande'),
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

/**
 * Invalida server-side TODAS as sessões do usuário atual antes do logout do
 * cookie. JWT é stateless: apagar o cookie só derruba ESTE navegador — uma cópia
 * do token roubada seguiria válida até o maxAge. Incrementar `sessionVersion`
 * torna qualquer token já emitido inválido na hora (getTenantContext e o re-sync
 * do jwt callback comparam o version). O cliente ainda chama `signOut()` p/ limpar
 * o cookie local e redirecionar. Best-effort: se o bump falhar, o logout do cookie
 * acontece mesmo assim.
 *
 * Efeito colateral intencional: "Sair" desconecta o usuário de TODOS os
 * dispositivos (revogação global). Logout por-dispositivo exigiria denylist de
 * jti (não implementado).
 */
export async function logoutAction() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return ok(null)

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    })
    logger.info('Sessions invalidated on logout', { userId })
  } catch (err) {
    logger.warn('Falha ao invalidar sessões no logout', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return ok(null)
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .max(255, 'Email de tamanho inválido')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email com formato inválido')
    .email(),
})

export async function forgotPasswordAction(input: z.infer<typeof forgotPasswordSchema>) {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.message)

  const email = parsed.data.email

  // Rate-limit: por CONTA (anti email-bombing) + por IP (anti flood/enumeração),
  // ANTES do lookup/envio. Resposta constante (`ok(null)`) mesmo bloqueado →
  // não revela se o email existe nem que houve throttle.
  const ip = getIpFromHeaders(await headers())
  if (await isResetRequestLocked(email, ip)) {
    logger.warn('Recuperação de senha bloqueada por rate-limit', { ip })
    return ok(null)
  }
  await recordResetRequest(email, ip)

  const user = await prisma.user.findUnique({
    where: { email, deletedAt: null, isActive: true },
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
  token: z.string().min(1).max(500, 'Token inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(100, 'Senha muito grande'),
})

export async function resetPasswordAction(input: z.infer<typeof resetPasswordSchema>) {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos')

  // Rate-limit por IP das tentativas de token — trava força-bruta de token.
  const ip = getIpFromHeaders(await headers())
  if (await isResetAttemptLocked(ip)) {
    logger.warn('Reset de senha bloqueado por rate-limit', { ip })
    return fail('Muitas tentativas. Tente novamente mais tarde.')
  }

  const tokenHash = hashToken(parsed.data.token)

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  if (!record) {
    await recordResetTokenFailure(ip)
    return fail('Token inválido')
  }
  if (record.usedAt) {
    await recordResetTokenFailure(ip)
    return fail('Token já utilizado')
  }
  if (record.expiresAt < new Date()) {
    await recordResetTokenFailure(ip)
    return fail('Token expirado')
  }

  const passwordHash = await hash(parsed.data.password, 12)

  // Atualiza senha e marca o token como usado em uma única transação para
  // evitar reuso em race condition.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      // Bump de sessionVersion: um reset de senha (fluxo de recuperação, conta
      // possivelmente comprometida) invalida TODAS as sessões existentes na hora.
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])

  logger.info('Password reset', { userId: record.userId })
  return ok(null)
}
