'use client'

import { TopbarShell, type TopbarShellProps } from '@/components/layout/topbar-shell'

type Props = Omit<TopbarShellProps, 'notificationsHref' | 'settingsHref'>

/**
 * Topbar do domínio Admin (Fase 5). Fixa o destino do sino na rota de
 * notificações da agência. Nenhuma string de domínio vaza para o layout.
 */
export function AdminTopbar(props: Props) {
  return <TopbarShell {...props} notificationsHref="/notifications" settingsHref="/settings" />
}
