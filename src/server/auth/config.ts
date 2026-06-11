import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getRequestIp } from '@/lib/request-ip'
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from '@/server/security/login-throttle'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        // Rate-limit (seguranca-pendencias #1): chave por email+IP e por IP. O IP
        // sai dos headers da request (atrás de proxy). `authorize` roda sem escopo
        // de clínica → o limiter (tabela fora da RLS) é seguro aqui.
        const ip = request instanceof Request ? getRequestIp(request) : 'unknown'
        const email = parsed.data.email

        // Lockout ANTES do bcrypt: nem gasta CPU se a janela já estourou.
        if (await isLoginLocked(email, ip)) {
          logger.warn('Login bloqueado por rate-limit', { ip })
          return null
        }

        // Select explícito para que `passwordHash` não trafegue além do escopo
        // estritamente necessário (regra de ouro §16.2 do prompt).
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email, deletedAt: null },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            organizationId: true,
            clientId: true,
            clinicRoleId: true,
            passwordHash: true,
            isActive: true,
          },
        })

        // Conta como falha tanto email inexistente quanto senha errada — resposta
        // constante (não enumera usuários).
        if (!user || !user.isActive || !user.passwordHash) {
          await recordLoginFailure(email, ip)
          return null
        }

        const { compare } = await import('bcryptjs')
        const valid = await compare(parsed.data.password, user.passwordHash)
        if (!valid) {
          await recordLoginFailure(email, ip)
          return null
        }

        // Sucesso → limpa o lockout daquela conta+origem.
        await clearLoginFailures(email, ip)

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          organizationId: user.organizationId,
          clientId: user.clientId,
          clinicRoleId: user.clinicRoleId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        token.organizationId = (user as { organizationId: string | null }).organizationId
        token.clientId = (user as { clientId: string | null }).clientId
        token.clinicRoleId = (user as { clinicRoleId: string | null }).clinicRoleId
        token.syncedAt = Date.now()
        return token
      }
      // Re-sincroniza claims com o DB no máximo a cada 10 min. Sem isso, os
      // claims ficam congelados desde o login (strategy: 'jwt' não bate no DB
      // por request): um token mintado antes de um reseed da org carrega um
      // organizationId que não existe mais → FK violation em writes. O throttle
      // mantém o espírito stateless (não é lookup por request) e ainda faz o
      // token se auto-curar — e propaga mudança de papel — em até 10 min.
      const TEN_MIN = 10 * 60 * 1000
      const last = (token.syncedAt as number | undefined) ?? 0
      if (token.id && Date.now() - last > TEN_MIN) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            organizationId: true,
            role: true,
            clientId: true,
            clinicRoleId: true,
            isActive: true,
            deletedAt: true,
          },
        })
        // Usuário sumiu, desativado ou soft-deletado → MATA a sessão (return
        // null destrói o token). Sem isso, o cookie JWT de alguém removido
        // seguia válido até o maxAge — auditoria 2026-06-10, Crítico 1. A
        // camada de dados já corta antes (getTenantContext relê o DB por
        // request); aqui derruba também páginas/middleware.
        if (!fresh || !fresh.isActive || fresh.deletedAt) {
          return null
        }
        token.organizationId = fresh.organizationId
        token.role = fresh.role
        token.clientId = fresh.clientId
        token.clinicRoleId = fresh.clinicRoleId
        token.syncedAt = Date.now()
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as import('@prisma/client').UserRole
        session.user.organizationId = token.organizationId as string | null
        session.user.clientId = token.clientId as string | null
        session.user.clinicRoleId = token.clinicRoleId as string | null
      }
      return session
    },
  },
} satisfies NextAuthConfig
