import { ForbiddenError } from '@/types/errors'

import { assertMutationBudget } from '@/server/security/mutation-throttle'

import { can } from './permissions'
import type { ClinicPermAction } from './clinic-permissions'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Ações que MUTAM dados — consomem o orçamento de escrita do usuário
 * (`mutation-throttle`) antes da checagem de permissão. `read`/`viewAll`
 * ficam fora: SSR, buscas com debounce e filtros não podem ser bloqueados.
 */
const MUTATING_ACTIONS: ReadonlySet<ClinicPermAction> = new Set([
  'write',
  'delete',
  'assignToOthers',
])

/**
 * Gate de permissão usado no início de Server Actions e jobs.
 * - ADMIN passa direto; titular (coroa) também (resolvido em `can()`).
 * - STAFF / CLIENT_OWNER / CLIENT_STAFF: resolvido pelo CARGO (AgencyRole/ClinicRole).
 *   Deny-by-default: sem cargo e sem coroa ⇒ negado. Ver `permissions.ts`.
 *
 * Também é o CHOKEPOINT do rate-limit de mutações (anti-DoS por volume):
 * toda ação write/delete/assignToOthers consome o orçamento por-usuário ANTES
 * de resolver a permissão — flood de tentativas (mesmo as que seriam negadas)
 * também para de bater no banco. Lança `TooManyRequestsError` ao estourar.
 *
 * Lança ForbiddenError se a ação não for permitida — o handler exterior
 * converte para Result<T> ou propaga conforme o caller.
 */
export async function assertCan(
  ctx: Pick<TenantContext, 'userId' | 'role'>,
  module: string,
  action: ClinicPermAction
): Promise<void> {
  if (MUTATING_ACTIONS.has(action)) {
    await assertMutationBudget(ctx.userId)
  }
  const ok = await can(ctx.userId, ctx.role, module, action)
  if (!ok) {
    throw new ForbiddenError(`Sem permissão para ${action} em ${module}`)
  }
}
