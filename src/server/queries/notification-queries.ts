import {
  countUnreadNotifications,
  listNotificationsForUser,
} from '@/server/repositories/notification-repository'
import { getTenantContext } from '@/server/tenant/context'

export type NotificationListRow = Awaited<
  ReturnType<typeof getNotificationsForCurrentUser>
>['rows'][number]

export async function getNotificationsForCurrentUser(
  options: {
    onlyUnread?: boolean
    take?: number
  } = {}
) {
  const ctx = await getTenantContext()
  const [rows, unread] = await Promise.all([
    listNotificationsForUser(ctx.userId, options),
    countUnreadNotifications(ctx.userId),
  ])
  return { rows, unread }
}

export async function getUnreadCount(): Promise<number> {
  const ctx = await getTenantContext()
  return countUnreadNotifications(ctx.userId)
}
