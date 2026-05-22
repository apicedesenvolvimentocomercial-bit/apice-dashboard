'use client'

import { TopbarShell, type TopbarShellProps } from '@/components/layout/topbar-shell'

type Props = Omit<TopbarShellProps, 'notificationsHref' | 'settingsHref'>

/**
 * Topbar do domínio Clínica (Fase 5). Fixa o destino do sino e das
 * configurações nas rotas PT da clínica (`/notificacoes`, `/configuracoes` —
 * slugs únicos porque route groups não namespaceiam URL; ver Fase 2/3/7).
 */
export function ClinicTopbar(props: Props) {
  return <TopbarShell {...props} notificationsHref="/notificacoes" settingsHref="/configuracoes" />
}
