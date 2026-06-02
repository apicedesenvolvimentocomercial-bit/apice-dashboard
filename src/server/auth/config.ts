import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import {
  clearRateLimit,
  clientIpFromHeaders,
  isRateLimited,
  LOGIN_RATE_LIMIT,
  registerHit,
} from '@/server/security/rate-limit'

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

        // Rate-limit de brute-force (SEC-002). Bloqueia por email E por IP; a
        // resposta de falha é a mesma (null) com ou sem bloqueio → não vaza se o
        // email existe nem quanto falta. Chaves limpas ao logar com sucesso.
        const ip = clientIpFromHeaders(request?.headers ?? new Headers())
        const emailKey = `login:email:${parsed.data.email.toLowerCase()}`
        const ipKey = `login:ip:${ip}`
        const [byEmail, byIp] = await Promise.all([isRateLimited(emailKey), isRateLimited(ipKey)])
        if (byEmail.blocked || byIp.blocked) return null

        const recordFailure = async () => {
          await Promise.all([
            registerHit(emailKey, LOGIN_RATE_LIMIT),
            registerHit(ipKey, LOGIN_RATE_LIMIT),
          ])
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

        if (!user || !user.isActive || !user.passwordHash) return recordFailure()

        const { compare } = await import('bcryptjs')
        const valid = await compare(parsed.data.password, user.passwordHash)
        if (!valid) return recordFailure()

        // Sucesso: zera os contadores de tentativa.
        await clearRateLimit([emailKey, ipKey])
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
          select: { organizationId: true, role: true, clientId: true, clinicRoleId: true },
        })
        if (fresh) {
          token.organizationId = fresh.organizationId
          token.role = fresh.role
          token.clientId = fresh.clientId
          token.clinicRoleId = fresh.clinicRoleId
        }
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
