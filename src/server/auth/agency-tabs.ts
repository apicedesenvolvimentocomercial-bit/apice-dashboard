import { redirect } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/auth/admin-context'
import { parseRolePermissions, roleHasTabAccess } from '@/server/auth/role-permissions'

/**
 * Gate de ABA da AGÊNCIA (deny-by-default, ledger agency-roles D3). Espelho de
 * `clinic-tabs.ts`. ADMIN e o titular da org (coroa) veem tudo. STAFF vê só o
 * que o cargo libera; STAFF sem cargo = zero acesso → /login.
 */
export type AgencyTab =
  | 'dashboard'
  | 'clients'
  | 'crm'
  | 'activities'
  | 'calendar'
  | 'staff'
  | 'notifications'
  | 'settings'

/** href (sob o domínio admin) → módulo de permissão. */
export const AGENCY_TAB_MODULE: Record<string, AgencyTab> = {
  '/dashboard': 'dashboard',
  '/clients': 'clients',
  '/pipeline': 'crm',
  '/activities': 'activities',
  '/calendar': 'calendar',
  '/staff': 'staff',
  '/notifications': 'notifications',
  '/settings': 'settings',
}

// Sempre visíveis a quem tem QUALQUER acesso (coroa ou cargo): dashboard,
// notificações e a própria conta — senão um cargo restrito ficaria sem destino.
const ALWAYS_VISIBLE: ReadonlySet<AgencyTab> = new Set(['dashboard', 'notifications', 'settings'])

export async function getVisibleAgencyTabs(ctx: AdminContext): Promise<Set<AgencyTab>> {
  const all = new Set<AgencyTab>(Object.values(AGENCY_TAB_MODULE))
  if (ctx.isOwner || ctx.role === 'ADMIN') return all
  // STAFF sem cargo → zero acesso.
  if (!ctx.agencyRoleId) return new Set()

  const role = await prisma.agencyRole.findUnique({
    where: { id: ctx.agencyRoleId },
    select: { permissions: true },
  })
  if (!role) return new Set()

  const perms = parseRolePermissions(role.permissions)
  const visible = new Set<AgencyTab>(ALWAYS_VISIBLE)
  for (const tab of all) {
    if (roleHasTabAccess(perms, tab)) visible.add(tab)
  }
  return visible
}

/** Algum acesso? (coroa/ADMIN ou cargo presente) */
export function hasAnyAgencyAccess(ctx: AdminContext): boolean {
  return ctx.isOwner || ctx.role === 'ADMIN' || !!ctx.agencyRoleId
}

/**
 * Gate de rota (deny-by-default): sem cargo e sem coroa → /login. Senão,
 * redireciona p/ /dashboard se a aba não é visível ao cargo.
 */
export async function assertAgencyTabAccess(ctx: AdminContext, tab: AgencyTab): Promise<void> {
  if (ctx.isOwner || ctx.role === 'ADMIN') return
  if (!hasAnyAgencyAccess(ctx)) redirect('/login')
  if (ALWAYS_VISIBLE.has(tab)) return

  const visible = await getVisibleAgencyTabs(ctx)
  if (!visible.has(tab)) redirect('/dashboard')
}

/**
 * Helper de uma linha p/ as pages do admin (espelho de `gateClinicTab`): resolve
 * o AdminContext e barra o acesso à aba num passo só. Use no topo da page:
 *   `const ctx = await gateAgencyTab('clients')`
 */
export async function gateAgencyTab(tab: AgencyTab): Promise<AdminContext> {
  const { getAdminContext } = await import('@/server/auth/admin-context')
  const ctx = await getAdminContext()
  await assertAgencyTabAccess(ctx, tab)
  return ctx
}
