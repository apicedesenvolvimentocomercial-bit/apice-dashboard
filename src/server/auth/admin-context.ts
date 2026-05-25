import { prisma } from '@/lib/prisma'
import { getTenantContext } from '@/server/tenant/context'
import { ForbiddenError } from '@/types/errors'

/**
 * Contexto especializado do domínio Admin (agência).
 *
 * Diferente de `TenantContext`, NÃO carrega `clientId` — actions/repos de
 * agência não operam no escopo de uma clínica. Usar este contexto torna o
 * domínio explícito e impede que código admin dependa de `clientId` de sessão.
 *
 * Espelha `ClinicContext`: expõe `isOwner` (a coroa da agência = ADMIN titular
 * de `Organization.ownerId`) e `agencyRoleId`, ambos lidos do DB por request
 * para refletir transferência de titularidade / mudança de cargo na hora (não
 * dependem do re-sync de ~10 min do JWT).
 *
 * Ver §3.2 / §3.4 do prompt de reforma (divisão total) + `prompt/agency-roles-progresso.md`.
 */
export type AdminContext = {
  userId: string
  organizationId: string
  role: 'ADMIN' | 'STAFF'
  agencyRoleId: string | null
  // ADMIN titular da organização (Organization.ownerId === userId) — a coroa.
  // STAFF nunca é titular.
  isOwner: boolean
}

export async function getAdminContext(): Promise<AdminContext> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') {
    throw new ForbiddenError('Domínio admin: requer role ADMIN ou STAFF')
  }

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { ownerId: true },
    }),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { agencyRoleId: true },
    }),
  ])

  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    role: ctx.role,
    agencyRoleId: user?.agencyRoleId ?? null,
    isOwner: org?.ownerId === ctx.userId,
  }
}
