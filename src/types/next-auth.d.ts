import type { UserRole } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      organizationId: string | null
      clientId: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    organizationId: string | null
    clientId: string | null
    // Epoch ms do último re-sync com o DB (throttle de 10 min no jwt callback).
    syncedAt: number
  }
}
