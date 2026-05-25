import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'
import {
  dashboardItemVisible,
  dashboardSectionVisible,
  parseDashboardPermissions,
} from '@/server/auth/clinic-permissions'
import { DASHBOARD_SECTIONS } from '@/modules/clinic-roles/dashboard-catalog'

/**
 * Mapa booleano de visibilidade do dashboard, pré-computado no server para
 * atravessar o boundary → client (funções não serializam). Uma entrada por
 * seção do catálogo, com flag da seção + flag por item.
 */
export type DashboardVisibility = Record<
  string,
  { section: boolean; items: Record<string, boolean> }
>

/** Tudo visível — titular, admin, ou contexto sem cargo (opt-out implícito). */
function allVisible(): DashboardVisibility {
  const out: DashboardVisibility = {}
  for (const sec of DASHBOARD_SECTIONS) {
    const items: Record<string, boolean> = {}
    for (const it of sec.items) items[it.key] = true
    out[sec.key] = { section: true, items }
  }
  return out
}

/**
 * Resolve a visibilidade do dashboard para o viewer (Etapa 3 / lacuna 2).
 * - Titular da clínica (coroa) → vê tudo.
 * - Sem cargo (`clinicRoleId` null) → vê tudo (opt-out p/ não quebrar quem não
 *   usa cargos; o gate de visibilidade é uma restrição opcional do cargo).
 * - Com cargo → aplica o opt-in do JSON `dashboard` do cargo.
 *
 * (Admin não passa por aqui — a página admin usa `allDashboardVisible()`.)
 */
export async function resolveDashboardVisibility(ctx: ClinicContext): Promise<DashboardVisibility> {
  if (ctx.isOwner || !ctx.clinicRoleId) return allVisible()

  const role = await prisma.clinicRole.findFirst({
    where: { id: ctx.clinicRoleId, clientId: ctx.clientId },
    select: { permissions: true },
  })
  if (!role) return allVisible()

  const perms = parseDashboardPermissions(role.permissions)
  const out: DashboardVisibility = {}
  for (const sec of DASHBOARD_SECTIONS) {
    const sectionOn = dashboardSectionVisible(perms, sec.key)
    const items: Record<string, boolean> = {}
    for (const it of sec.items) {
      items[it.key] = sectionOn && dashboardItemVisible(perms, sec.key, it.key)
    }
    out[sec.key] = { section: sectionOn, items }
  }
  return out
}

/** Visibilidade total (admin vendo a clínica). */
export function allDashboardVisible(): DashboardVisibility {
  return allVisible()
}
