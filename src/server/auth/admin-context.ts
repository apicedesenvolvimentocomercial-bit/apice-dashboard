import { getTenantContext } from '@/server/tenant/context'
import { ForbiddenError } from '@/types/errors'

/**
 * Contexto especializado do domínio Admin (agência).
 *
 * Diferente de `TenantContext`, NÃO carrega `clientId` — actions/repos de
 * agência não operam no escopo de uma clínica. Usar este contexto torna o
 * domínio explícito e impede que código admin dependa de `clientId` de sessão.
 *
 * Ver §3.2 / §3.4 do prompt de reforma (divisão total).
 */
export type AdminContext = {
  userId: string
  organizationId: string
  role: 'ADMIN' | 'STAFF'
}

export async function getAdminContext(): Promise<AdminContext> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') {
    throw new ForbiddenError('Domínio admin: requer role ADMIN ou STAFF')
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role }
}
