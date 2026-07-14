import { cache } from 'react'

import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { auth } from '@/server/auth'
import { ForbiddenError, UnauthorizedError } from '@/types/errors'

export type TenantContext = {
  userId: string
  organizationId: string
  role: UserRole
  clientId: string | null
  clinicRoleId: string | null
}

/**
 * Estado FRESCO do usuário, 1 query por request (dedupe via React cache).
 * O JWT identifica QUEM é (`userId`); os claims de autorização (role, clientId,
 * clinicRoleId) saem do DB a cada request — mudança de cargo/role/desativação
 * vale na hora, sem esperar o re-sync de 10 min do token (achados Crítico 1 e
 * Médio 1 da auditoria de usuários, 2026-06-10).
 */
const getFreshUser = cache(async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      role: true,
      clientId: true,
      clinicRoleId: true,
      sessionVersion: true,
      isActive: true,
      deletedAt: true,
    },
  })
})

export async function getTenantContext(): Promise<TenantContext> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new UnauthorizedError()
  }

  // Autorização decide pelo DB, não pelo cookie: usuário desativado/removido
  // perde acesso no request seguinte mesmo com JWT ainda válido.
  const fresh = await getFreshUser(session.user.id)
  if (!fresh || !fresh.isActive || fresh.deletedAt || !fresh.organizationId) {
    throw new UnauthorizedError()
  }

  // Revogação de JWT (instantânea, por request). O token carrega o sessionVersion
  // do login; se o DB avançou (logout/troca/reset de senha, ou "sair de todos os
  // dispositivos"), este token é de uma sessão morta → nega o acesso a dados JÁ no
  // próximo request, sem esperar o re-sync de 10 min nem o maxAge do cookie. O
  // coalesce p/ 0 tolera tokens emitidos antes desta feature (claim ausente = 0).
  if (fresh.sessionVersion !== (session.user.sessionVersion ?? 0)) {
    throw new UnauthorizedError()
  }

  return {
    userId: session.user.id,
    organizationId: fresh.organizationId,
    role: fresh.role,
    clientId: fresh.clientId,
    clinicRoleId: fresh.clinicRoleId,
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
