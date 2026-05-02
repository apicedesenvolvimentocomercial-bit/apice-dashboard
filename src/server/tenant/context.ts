import type { UserRole } from '@prisma/client'

import { auth } from '@/server/auth'

export type TenantContext = {
  userId: string
  organizationId: string
  role: UserRole
  clientId: string | null
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
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
