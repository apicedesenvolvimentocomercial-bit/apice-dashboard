import type { NotificationType, Prisma } from '@prisma/client'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { prisma } from '@/lib/prisma'

import {
  createNotifications,
  hasRecentNotification,
  type NotificationRow,
} from '@/server/repositories/notification-repository'

/**
 * Tipos para os quais disparamos email mesmo em produção.
 * Os demais ficam apenas in-app — evita spam e respeita §7.16
 * (email para "tipos críticos").
 */
const EMAIL_TYPES: NotificationType[] = [
  'INSIGHT_GENERATED',
  'GOAL_AT_RISK',
  'ACTIVITY_OVERDUE',
  'CLIENT_INACTIVE',
]

export type NotificationDispatch = {
  type: NotificationType
  title: string
  message: string
  link?: string | null
  metadata?: Prisma.InputJsonValue
  /** Janela de deduplicação em horas — evita duplicar no mesmo dia. */
  dedupeWindowHours?: number
}

export type DispatchTarget = {
  userId: string
  email?: string | null
  name?: string | null
}

export async function dispatchNotification(
  targets: DispatchTarget[],
  payload: NotificationDispatch
): Promise<{ created: number; skipped: number; emailed: number }> {
  if (targets.length === 0) return { created: 0, skipped: 0, emailed: 0 }

  const link = payload.link ?? null
  const toCreate: DispatchTarget[] = []

  for (const t of targets) {
    if (payload.dedupeWindowHours && link) {
      const dup = await hasRecentNotification({
        userId: t.userId,
        type: payload.type,
        link,
        sinceHours: payload.dedupeWindowHours,
      })
      if (dup) continue
    }
    toCreate.push(t)
  }

  if (toCreate.length === 0) {
    return { created: 0, skipped: targets.length, emailed: 0 }
  }

  await createNotifications(
    toCreate.map((t) => ({
      userId: t.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link,
      metadata: payload.metadata,
    }))
  )

  let emailed = 0
  if (EMAIL_TYPES.includes(payload.type) && resend) {
    for (const t of toCreate) {
      if (!t.email) continue
      try {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: t.email,
          subject: payload.title,
          html: renderEmail({
            title: payload.title,
            message: payload.message,
            link,
            recipientName: t.name ?? undefined,
          }),
        })
        emailed++
      } catch (err) {
        logger.error('Notification email failed', {
          userId: t.userId,
          type: payload.type,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return { created: toCreate.length, skipped: targets.length - toCreate.length, emailed }
}

function renderEmail(args: {
  title: string
  message: string
  link?: string | null
  recipientName?: string
}): string {
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const fullLink = args.link
    ? args.link.startsWith('http')
      ? args.link
      : `${appUrl}${args.link}`
    : null
  const greeting = args.recipientName ? `Olá, ${escapeHtml(args.recipientName)},` : 'Olá,'

  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #18181b;">
      <h2 style="margin: 0 0 16px; font-size: 18px;">${escapeHtml(args.title)}</h2>
      <p style="font-size: 14px; line-height: 1.5;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.5; white-space: pre-line;">${escapeHtml(args.message)}</p>
      ${
        fullLink
          ? `<p><a href="${fullLink}" style="display:inline-block; background:#059669; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:600;">Abrir no ${env.NEXT_PUBLIC_APP_NAME}</a></p>`
          : ''
      }
      <p style="font-size: 12px; color: #71717a; margin-top: 24px;">
        Você está recebendo este email porque tem notificações ativas no ${env.NEXT_PUBLIC_APP_NAME}.
      </p>
    </div>
  `.trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function getRecipientsForActivity(activity: {
  assignedToId: string | null
  organizationId: string
  clientId: string | null
}): Promise<DispatchTarget[]> {
  if (!activity.assignedToId) return []
  const user = await prisma.user.findUnique({
    where: { id: activity.assignedToId },
    select: { id: true, email: true, name: true, isActive: true, deletedAt: true },
  })
  if (!user || !user.isActive || user.deletedAt) return []
  return [{ userId: user.id, email: user.email, name: user.name }]
}

/**
 * Notificações de clínica (insights, metas em risco etc.) vão para os donos
 * da clínica. ADMINs da organização NÃO são incluídos por padrão — o
 * painel deles tem outros canais (audit log, dashboard) e a caixa de
 * notificação fica reservada a coisas que afetam diretamente o usuário.
 *
 * Se `clientId` for null (ex.: evento global da organização), retorna vazio
 * porque não há um "dono" claro a notificar.
 */
export async function getRecipientsForClient(
  organizationId: string,
  clientId: string | null
): Promise<DispatchTarget[]> {
  if (!clientId) return []
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      clientId,
      role: 'CLIENT_OWNER',
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true, name: true },
  })
  return users.map((u) => ({ userId: u.id, email: u.email, name: u.name }))
}

export function summarizeUnread(rows: NotificationRow[]): {
  total: number
  critical: number
} {
  let critical = 0
  for (const r of rows) {
    if (r.readAt) continue
    if (
      r.type === 'INSIGHT_GENERATED' ||
      r.type === 'ACTIVITY_OVERDUE' ||
      r.type === 'GOAL_AT_RISK'
    ) {
      critical++
    }
  }
  return { total: rows.filter((r) => !r.readAt).length, critical }
}
