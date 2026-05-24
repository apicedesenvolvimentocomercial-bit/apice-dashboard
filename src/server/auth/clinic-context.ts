import { prisma } from '@/lib/prisma'
import { enterClientScope } from '@/server/tenant/client-scope'
import { getTenantContext } from '@/server/tenant/context'
import { ForbiddenError } from '@/types/errors'

/**
 * Contexto especializado do domínio Clínica.
 *
 * Invariante crítica: `clientId` é `string` (NÃO `string | null`). Toda função
 * de acesso a dado operacional de clínica recebe este contexto e injeta
 * `where.clientId = ctx.clientId` incondicionalmente — esquecer o filtro vira
 * erro de tipo, não vazamento cross-tenant em produção (defesa em profundidade,
 * §3.2 / §3.4 do prompt de reforma).
 */
export type ClinicContext = {
  userId: string
  organizationId: string
  role: 'CLIENT_OWNER' | 'CLIENT_STAFF'
  clientId: string
  clinicRoleId: string | null
  // Titular/criador da clínica (Client.ownerId === userId) — a "coroa". Único
  // com acesso total e que altera dados sensíveis da clínica. Calculado por
  // request a partir do DB (não vem do JWT) para refletir transferências de
  // titularidade imediatamente.
  isOwner: boolean
}

export async function getClinicContext(): Promise<ClinicContext> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'CLIENT_OWNER' && ctx.role !== 'CLIENT_STAFF') {
    throw new ForbiddenError('Domínio clínica: requer role CLIENT_OWNER ou CLIENT_STAFF')
  }
  if (!ctx.clientId) {
    throw new ForbiddenError('Sessão de clínica sem clientId')
  }
  // Fixa o escopo de clínica no request → a extensão do Prisma injeta a GUC de
  // RLS em toda query subsequente (ver `prompt/rls-gambiarra.md`).
  enterClientScope(ctx.clientId)

  // A coroa é lida do DB (não do JWT) p/ refletir transferência de titularidade
  // sem esperar o re-sync de 10 min do token.
  const client = await prisma.client.findUnique({
    where: { id: ctx.clientId },
    select: { ownerId: true },
  })

  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    role: ctx.role,
    clientId: ctx.clientId,
    clinicRoleId: ctx.clinicRoleId,
    isOwner: client?.ownerId === ctx.userId,
  }
}
