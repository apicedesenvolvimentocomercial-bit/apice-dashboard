import type { NotificationType, Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

export type NotificationRow = Awaited<ReturnType<typeof listNotificationsForUser>>[number]

export async function listNotificationsForUser(
  userId: string,
  options: { onlyUnread?: boolean; take?: number } = {}
) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(options.onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 25,
  })
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } })
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function createNotification(data: {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string | null
  metadata?: Prisma.InputJsonValue
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link ?? null,
      metadata: data.metadata,
    },
  })
}

export async function createNotifications(
  rows: Array<{
    userId: string
    type: NotificationType
    title: string
    message: string
    link?: string | null
    metadata?: Prisma.InputJsonValue
  }>
) {
  if (rows.length === 0) return { count: 0 }
  return prisma.notification.createMany({
    data: rows.map((r) => ({
      userId: r.userId,
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link ?? null,
      metadata: r.metadata,
    })),
    skipDuplicates: false,
  })
}

/**
 * Idempotência: evita duplicar notificações de um mesmo gatilho diário
 * para o mesmo (userId, type, link). Útil para activity_due/overdue
 * que rodam em cron diário.
 */
export async function hasRecentNotification(params: {
  userId: string
  type: NotificationType
  link: string
  sinceHours: number
}): Promise<boolean> {
  const since = new Date(Date.now() - params.sinceHours * 60 * 60 * 1000)
  const found = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      type: params.type,
      link: params.link,
      createdAt: { gte: since },
    },
    select: { id: true },
  })
  return !!found
}

/**
 * Donos ativos de uma clínica. ADMINs da organização NÃO entram aqui — a
 * caixa de notificação do admin não deve ficar entulhada com eventos das
 * clínicas. Se precisar avisar admin de algo, use canal próprio.
 */
export async function listRecipientsForClient(
  organizationId: string,
  clientId: string | null
): Promise<{ id: string; email: string; name: string }[]> {
  if (!clientId) return []
  return prisma.user.findMany({
    where: {
      organizationId,
      clientId,
      role: 'CLIENT_OWNER',
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true, name: true },
  })
}

/**
 * Hard-delete de uma notificação do próprio usuário (botão X). Escopo por
 * userId garante que ninguém apague notificação alheia.
 */
export async function deleteNotification(userId: string, notificationId: string) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId },
  })
}
