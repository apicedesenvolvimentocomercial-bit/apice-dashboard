import { ForbiddenError } from '@/types/errors'

import { can } from './permissions'
import type { ClinicPermAction } from './clinic-permissions'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Gate de permissão usado no início de Server Actions e jobs.
 * - ADMIN passa direto; titular (coroa) também (resolvido em `can()`).
 * - STAFF / CLIENT_OWNER / CLIENT_STAFF: resolvido pelo CARGO (AgencyRole/ClinicRole).
 *   Deny-by-default: sem cargo e sem coroa ⇒ negado. Ver `permissions.ts`.
 *
 * Lança ForbiddenError se a ação não for permitida — o handler exterior
 * converte para Result<T> ou propaga conforme o caller.
 */
export async function assertCan(
  ctx: Pick<TenantContext, 'userId' | 'role'>,
  module: string,
  action: ClinicPermAction
): Promise<void> {
  const ok = await can(ctx.userId, ctx.role, module, action)
  if (!ok) {
    throw new ForbiddenError(`Sem permissão para ${action} em ${module}`)
  }
}
