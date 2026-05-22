import { ForbiddenError } from '@/types/errors'

import { can } from './permissions'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Gate de permissão usado no início de Server Actions e jobs.
 * - ADMIN passa direto.
 * - STAFF / CLIENT_OWNER / CLIENT_STAFF: confere defaults + overrides em UserPermission.
 *
 * Lança ForbiddenError se a ação não for permitida — o handler exterior
 * converte para Result<T> ou propaga conforme o caller.
 */
export async function assertCan(
  ctx: Pick<TenantContext, 'userId' | 'role'>,
  module: string,
  action: 'read' | 'write' | 'delete'
): Promise<void> {
  const ok = await can(ctx.userId, ctx.role, module, action)
  if (!ok) {
    throw new ForbiddenError(`Sem permissão para ${action} em ${module}`)
  }
}
