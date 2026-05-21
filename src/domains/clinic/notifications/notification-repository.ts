import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Notificações do DOMÍNIO CLÍNICA (reforma divisão total, Fase 2).
 *
 * Notificação é por destinatário (`userId`), mas o escopo de domínio é
 * garantido por `clientId`. Um CLIENT_* só lê notificações cujo `clientId` é
 * o da sua clínica E cujo `userId` é o dele — defesa em profundidade sobre o
 * filtro por usuário. Recipientes de clínica = CLIENT_* da MESMA clínica (§4),
 * incluindo CLIENT_STAFF (diferente de `listRecipientsForClient`, que só
 * pega CLIENT_OWNER no fluxo legado de insights).
 */

export async function listClinicNotifications(
  ctx: ClinicContext,
  options: { onlyUnread?: boolean; take?: number } = {}
) {
  return prisma.notification.findMany({
    where: {
      userId: ctx.userId,
      clientId: ctx.clientId,
      ...(options.onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 25,
  })
}

export async function countUnreadClinicNotifications(ctx: ClinicContext): Promise<number> {
  return prisma.notification.count({
    where: { userId: ctx.userId, clientId: ctx.clientId, readAt: null },
  })
}

export async function markClinicNotificationRead(ctx: ClinicContext, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId: ctx.userId, clientId: ctx.clientId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function markAllClinicNotificationsRead(ctx: ClinicContext) {
  return prisma.notification.updateMany({
    where: { userId: ctx.userId, clientId: ctx.clientId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function deleteClinicNotification(ctx: ClinicContext, notificationId: string) {
  return prisma.notification.deleteMany({
    where: { id: notificationId, userId: ctx.userId, clientId: ctx.clientId },
  })
}

/**
 * Destinatários de uma notificação de clínica: usuários ativos da MESMA
 * clínica (membership por clientId, cargo-agnóstico). Nunca inclui a agência —
 * clientId só é setado em usuário de clínica.
 */
export async function listClinicRecipients(
  ctx: ClinicContext
): Promise<{ id: string; email: string; name: string }[]> {
  return prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, email: true, name: true },
  })
}
