import type { Metadata } from 'next'

import { NotificationsPage } from '@/modules/notifications/notifications-page'
import { getNotificationsForCurrentUser } from '@/server/queries/notification-queries'

export const metadata: Metadata = { title: 'Notificações' }

export default async function AdminNotificationsPage() {
  const { rows, unread } = await getNotificationsForCurrentUser({ take: 100 })
  return <NotificationsPage notifications={rows} unreadCount={unread} />
}
