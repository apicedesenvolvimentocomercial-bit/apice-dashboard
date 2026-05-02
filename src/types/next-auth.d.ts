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
