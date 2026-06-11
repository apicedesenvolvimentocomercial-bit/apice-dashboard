import type { Metadata } from 'next'

import { ClinicExportsPage } from '@/components/clinic/exports/clinic-exports-page'
import { can } from '@/server/auth/permissions'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import { EXPORT_RESOURCES } from '@/server/services/export-service'

export const metadata: Metadata = { title: 'Exportações' }

export default async function ClinicExportsRoute() {
  // Gate da aba (módulo `reports`). Dentro dela, cada dataset ainda exige
  // `module:read` do módulo de ORIGEM — a página esconde o card e a rota de
  // export re-valida server-side (não confie só na UI).
  const ctx = await gateClinicTab('reports')

  const modules = [...new Set(EXPORT_RESOURCES.map((r) => r.module))]
  const readable = new Set<string>()
  if (ctx.isOwner) {
    for (const m of modules) readable.add(m)
  } else {
    const checks = await Promise.all(modules.map((m) => can(ctx.userId, ctx.role, m, 'read')))
    modules.forEach((m, i) => {
      if (checks[i]) readable.add(m)
    })
  }

  const resources = EXPORT_RESOURCES.filter((r) => readable.has(r.module)).map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description,
    supportsRange: r.supportsRange,
  }))

  return (
    <ClinicExportsPage
      clientId={ctx.clientId}
      resources={resources}
      canFinancialReport={readable.has('financial')}
    />
  )
}
