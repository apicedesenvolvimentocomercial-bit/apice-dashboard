import { getClinicContext } from '@/server/auth/clinic-context'

import { countUnreadClinicNotifications, listClinicNotifications } from './notification-repository'

/**
 * Leitura de notificações do DOMÍNIO CLÍNICA (Fase 2). Escopo `clientId` +
 * `userId` garantido pelo `ClinicContext` — o usuário de clínica só vê o que é
 * da sua clínica.
 */
export async function getClinicNotifications(
  options: { onlyUnread?: boolean; take?: number } = {}
) {
  const ctx = await getClinicContext()
  const [rows, unread] = await Promise.all([
    listClinicNotifications(ctx, options),
    countUnreadClinicNotifications(ctx),
  ])
  return { rows, unread }
}
