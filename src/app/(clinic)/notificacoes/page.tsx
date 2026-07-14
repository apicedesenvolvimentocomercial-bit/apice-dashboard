import type { Metadata } from 'next'

import { ClinicNotificationsPage } from '@/components/clinic/notifications/clinic-notifications-page'
import { getClinicNotifications } from '@/domains/clinic/notifications/notification-queries'

export const metadata: Metadata = { title: 'Notificações' }

export default async function ClinicNotificationsRoute() {
  // getClinicNotifications usa getClinicContext: lança se a sessão não for de
  // clínica ou faltar clientId. O (clinic)/layout já barra role errado antes.
  const { rows, unread } = await getClinicNotifications({ take: 50 }).catch(() => ({
    rows: [],
    unread: 0,
  }))

  return <ClinicNotificationsPage notifications={rows} unreadCount={unread} nowMs={Date.now()} />
}
