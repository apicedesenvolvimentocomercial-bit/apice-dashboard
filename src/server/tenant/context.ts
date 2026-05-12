import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import { ForbiddenError, UnauthorizedError } from '@/types/errors'

export type TenantContext = {
  userId: string
  organizationId: string
  role: UserRole
  clientId: string | null
}

export async function getTenantContext(): Promise<TenantContext> {
  const session = await auth()
  if (!session?.user?.id || !session.user.organizationId) {
    throw new UnauthorizedError()
  }

  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: session.user.role as UserRole,
    clientId: session.user.clientId ?? null,
  }
}

/**
 * Regra de ouro §5.3 do prompt: NUNCA confiar em `clientId` vindo do form.
 * Esta função garante que:
 *  - CLIENT_OWNER/CLIENT_STAFF só acessa a clínica vinculada à sessão deles.
 *  - ADMIN/STAFF só acessa clínicas da própria Organization.
 * Lança ForbiddenError se o `clientId` informado não bate com o tenant.
 */
export async function assertClientAccess(ctx: TenantContext, clientId: string): Promise<void> {
  if (!clientId) throw new ForbiddenError('clientId obrigatório')

  if (ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF') {
    if (ctx.clientId !== clientId) {
      throw new ForbiddenError('Acesso a clínica diferente da sua sessão')
    }
    return
  }

  // ADMIN ou STAFF: o cliente precisa pertencer à mesma organização.
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!exists) throw new ForbiddenError('Clínica fora da sua organização')
}
