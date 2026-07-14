import type { UserRole } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      organizationId: string | null
      clientId: string | null
      clinicRoleId: string | null
      // Versão da sessão gravada no token no login. getTenantContext compara com
      // o valor fresco do DB e derruba o token se divergir (revogação de JWT).
      sessionVersion: number
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    organizationId: string | null
    clientId: string | null
    clinicRoleId: string | null
    // Epoch ms do último re-sync com o DB (throttle de 10 min no jwt callback).
    syncedAt: number
    // Versão da sessão no momento do login. Revogação de JWT: se o DB avançou
    // (logout/troca/reset de senha), o token vira inválido. Opcional p/ tolerar
    // tokens emitidos antes desta feature (ausência = 0).
    sessionVersion?: number
  }
}
