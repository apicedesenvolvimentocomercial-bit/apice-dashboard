import type { NotificationType, Prisma } from '@prisma/client'

import { env } from '@/lib/env'
import { resend, sendEmail } from '@/lib/resend'
import { prisma } from '@/lib/prisma'
import {
  notificationChannelEnabled,
  parseNotificationPermissions,
  parseRolePermissions,
  roleCan,
} from '@/server/auth/role-permissions'

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

/**
 * Categoria de preferência por tipo — chave consultada no bloco `notifications`
 * do JSON do cargo (role-permissions). Tipos novos sem categoria explícita no
 * payload caem aqui; desconhecido ⇒ 'system'.
 */
const CATEGORY_BY_TYPE: Partial<Record<NotificationType, string>> = {
  INSIGHT_GENERATED: 'insights',
  GOAL_AT_RISK: 'goals',
  GOAL_ACHIEVED: 'goals',
  ACTIVITY_DUE: 'activities',
  ACTIVITY_OVERDUE: 'activities',
  CLIENT_INACTIVE: 'patients',
  SYSTEM: 'system',
}

export type NotificationDispatch = {
  type: NotificationType
  title: string
  message: string
  link?: string | null
  metadata?: Prisma.InputJsonValue
  /** Janela de deduplicação em horas — evita duplicar no mesmo dia. */
  dedupeWindowHours?: number
  /**
   * Categoria de preferência (override). Permite que tipos genéricos (SYSTEM)
   * sejam filtrados por uma categoria específica (ex.: 'crm', 'financial').
   * Ausente ⇒ deriva do `type` via CATEGORY_BY_TYPE.
   */
  category?: string
}

export type DispatchTarget = {
  userId: string
  email?: string | null
  name?: string | null
  // Escopo de domínio (Fase 1/2): clientId do destinatário quando é de clínica;
  // null/undefined p/ agência. Grava em Notification.clientId → a notificação
  // aparece no painel de notificações da clínica (que filtra por clientId).
  clientId?: string | null
}

export async function dispatchNotification(
  targets: DispatchTarget[],
  payload: NotificationDispatch
): Promise<{ created: number; skipped: number; emailed: number }> {
  if (targets.length === 0) return { created: 0, skipped: 0, emailed: 0 }

  const link = payload.link ?? null
  const category = payload.category ?? CATEGORY_BY_TYPE[payload.type] ?? 'system'

  // Preferências por cargo (chave `notifications` do JSON do cargo) — ponto
  // ÚNICO de enforcement: todo dispatch respeita a config sem código extra no
  // chamador. Coroa (titular) ignora o cargo; sem cargo ⇒ default ligado
  // (agência/assignee admin). Opt-out: ausência de config ⇒ tudo ligado.
  const prefUsers = await prisma.user.findMany({
    where: { id: { in: targets.map((t) => t.userId) } },
    select: {
      id: true,
      ownedClient: { select: { id: true } },
      clinicRole: { select: { permissions: true } },
    },
  })
  const emailMuted = new Set<string>()
  const inAppMuted = new Set<string>()
  for (const u of prefUsers) {
    if (u.ownedClient || !u.clinicRole) continue
    const prefs = parseNotificationPermissions(u.clinicRole.permissions)
    if (!notificationChannelEnabled(prefs, category, 'inApp')) inAppMuted.add(u.id)
    if (!notificationChannelEnabled(prefs, category, 'email')) emailMuted.add(u.id)
  }

  const toCreate: DispatchTarget[] = []

  for (const t of targets) {
    if (inAppMuted.has(t.userId)) continue
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
      clientId: t.clientId ?? null,
    }))
  )

  let emailed = 0
  if (EMAIL_TYPES.includes(payload.type) && resend) {
    for (const t of toCreate) {
      if (!t.email) continue
      if (emailMuted.has(t.userId)) continue
      // sendEmail já checa o error retornado pelo Resend, retenta rate limit
      // e loga falhas — só incrementamos quando realmente enviou.
      const res = await sendEmail({
        to: t.email,
        subject: payload.title,
        html: renderEmail({
          title: payload.title,
          message: payload.message,
          link,
          recipientName: t.name ?? undefined,
        }),
      })
      if (res.ok) emailed++
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
          ? `<p><a href="${escapeHtml(fullLink)}" style="display:inline-block; background:#059669; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:600;">Abrir no ${env.NEXT_PUBLIC_APP_NAME}</a></p>`
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
    select: { id: true, email: true, name: true, isActive: true, deletedAt: true, clientId: true },
  })
  if (!user || !user.isActive || user.deletedAt) return []
  return [{ userId: user.id, email: user.email, name: user.name, clientId: user.clientId }]
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
  // clientId conhecido (param) → grava na notificação p/ escopo de domínio.
  return users.map((u) => ({ userId: u.id, email: u.email, name: u.name, clientId }))
}

/**
 * Destinatários de clínica por MÓDULO: titular (coroa) + usuários cujo cargo
 * concede `module:read`. Espelha a resolução de `can()` (deny-by-default):
 * sem cargo e sem coroa ⇒ fora da lista. Uma query só — cargo e coroa vêm
 * junto, sem N round-trips.
 *
 * Use no lugar de `getRecipientsForClient` quando o aviso pertence a uma aba
 * (insights, goals, financial…) — staff com acesso à aba também fica sabendo.
 */
export async function getRecipientsForModule(
  organizationId: string,
  clientId: string | null,
  module: string
): Promise<DispatchTarget[]> {
  if (!clientId) return []
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      clientId,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      ownedClient: { select: { id: true } },
      clinicRole: { select: { permissions: true } },
    },
  })
  return users
    .filter((u) => {
      if (u.ownedClient?.id === clientId) return true
      if (!u.clinicRole) return false
      return roleCan(parseRolePermissions(u.clinicRole.permissions), module, 'read')
    })
    .map((u) => ({ userId: u.id, email: u.email, name: u.name, clientId }))
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
