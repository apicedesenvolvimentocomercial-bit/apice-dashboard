import { redirect } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'
import {
  clinicRoleHasTabAccess,
  parseClinicRolePermissions,
} from '@/server/auth/clinic-permissions'

/**
 * Gate de ABA da clínica (Etapa 1 — decisão D2): uma aba bloqueada pelo cargo
 * some da sidebar E a rota redireciona. Este módulo é a fonte única de qual
 * aba o usuário enxerga, usado pela sidebar (filtra itens) e pelas pages
 * (`assertTabAccess`).
 *
 * Módulo = identidade lógica da aba (igual aos módulos de permissão). O `href`
 * é a rota; pode haver href→módulo N:1 no futuro, mas hoje é 1:1.
 */
export type ClinicTab =
  | 'overview'
  | 'activities'
  | 'appointments'
  | 'crm'
  | 'patients'
  | 'financial'
  | 'goals'
  | 'insights'
  | 'procedures'
  | 'notificacoes'
  | 'settings'

/** href (sob o domínio clínica) → módulo de permissão. */
export const TAB_MODULE: Record<string, ClinicTab> = {
  '/overview': 'overview',
  '/atividades': 'activities',
  '/appointments': 'appointments',
  '/crm': 'crm',
  '/patients': 'patients',
  '/financial': 'financial',
  '/goals': 'goals',
  '/insights': 'insights',
  '/procedures': 'procedures',
  '/notificacoes': 'notificacoes',
  '/configuracoes': 'settings',
}

// Abas que todo usuário interno da clínica sempre vê, independentemente de
// cargo: a home (overview), notificações e a própria página de conta
// (configuracoes/"Meu perfil"). Sem isso um cargo restrito ficaria sem destino
// pós-login e sem como trocar a própria senha.
const ALWAYS_VISIBLE: ReadonlySet<ClinicTab> = new Set(['overview', 'notificacoes', 'settings'])

/**
 * Conjunto de abas que este contexto pode ver (DENY-BY-DEFAULT, ledger
 * agency-roles D3).
 * - Titular (coroa) → todas.
 * - Sem cargo (e sem coroa) → NENHUMA (deny-by-default; o gate manda p/ login).
 * - Com cargo → ALWAYS_VISIBLE + as abas com `access !== false` no cargo.
 */
export async function getVisibleTabs(ctx: ClinicContext): Promise<Set<ClinicTab>> {
  const all = new Set<ClinicTab>(Object.values(TAB_MODULE))
  if (ctx.isOwner) return all
  // Sem cargo → zero acesso.
  if (!ctx.clinicRoleId) return new Set()

  const role = await prisma.clinicRole.findUnique({
    where: { id: ctx.clinicRoleId },
    select: { permissions: true },
  })
  // Cargo sumiu → trata como sem cargo (deny-by-default).
  if (!role) return new Set()

  const perms = parseClinicRolePermissions(role.permissions)
  const visible = new Set<ClinicTab>(ALWAYS_VISIBLE)
  for (const tab of all) {
    if (clinicRoleHasTabAccess(perms, tab)) visible.add(tab)
  }
  return visible
}

/**
 * Deny-by-default: usuário de clínica sem coroa e sem cargo (ou com cargo que
 * sumiu) não tem nenhum acesso → expulso para /login até receber um cargo.
 */
function hasAnyClinicAccess(ctx: ClinicContext): boolean {
  return ctx.isOwner || !!ctx.clinicRoleId
}

/**
 * Gate de rota (deny-by-default):
 *  - Sem cargo e sem coroa → redirect /login (zero acesso).
 *  - Aba sempre-visível → ok (mas só pra quem tem algum acesso).
 *  - Senão, redireciona p/ /overview se a aba não é visível ao cargo.
 */
export async function assertTabAccess(ctx: ClinicContext, tab: ClinicTab): Promise<void> {
  if (ctx.isOwner) return
  if (!hasAnyClinicAccess(ctx)) redirect('/login')
  if (ALWAYS_VISIBLE.has(tab)) return

  const visible = await getVisibleTabs(ctx)
  if (!visible.has(tab)) redirect('/overview')
}

/**
 * Helper de uma linha p/ as pages da clínica: resolve o contexto e barra o
 * acesso à aba num passo só. Use no topo da page gateável:
 *   `await gateClinicTab('financial')`
 * (re-usa `getClinicContext`, que já fixa o escopo RLS do request.)
 */
export async function gateClinicTab(tab: ClinicTab): Promise<ClinicContext> {
  const { getClinicContext } = await import('@/server/auth/clinic-context')
  const ctx = await getClinicContext()
  await assertTabAccess(ctx, tab)
  return ctx
}
