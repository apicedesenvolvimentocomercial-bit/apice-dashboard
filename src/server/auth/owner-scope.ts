import type { TenantContext } from '@/server/tenant/context'

import { can } from './permissions'

/**
 * Escopo de visibilidade por-dono (item 4 — pipelines/agenda pessoais).
 *
 * Devolve o `userId` pelo qual filtrar leads/agendamentos/pipelines, ou `null` =
 * ver TUDO. Vê tudo quem:
 *   • é ADMIN/STAFF da agência (visão cross-clínica do admin), OU
 *   • é o titular da clínica (coroa — `can()` já o trata como acesso total), OU
 *   • tem o cargo com `{module}:viewAll`.
 * Os demais usuários de clínica só veem o que é deles (`ctx.userId`).
 *
 * O filtro é INTRA-clínica: soma-se ao isolamento por `clientId` + RLS, nunca o
 * substitui. Um erro aqui afeta só a visibilidade entre usuários da MESMA
 * clínica, jamais vaza entre clínicas.
 */
export async function resolveOwnerScope(
  ctx: TenantContext,
  module: 'crm' | 'appointments'
): Promise<string | null> {
  if (ctx.role !== 'CLIENT_OWNER' && ctx.role !== 'CLIENT_STAFF') return null
  if (await can(ctx.userId, ctx.role, module, 'viewAll')) return null
  return ctx.userId
}
