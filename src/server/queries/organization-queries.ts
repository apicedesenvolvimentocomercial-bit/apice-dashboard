import { prisma } from '@/lib/prisma'

/**
 * Retorna true se o usuário é o dono da organização ao qual pertence.
 * Usado para exibir a coroa no topbar e habilitar o "Transferir titularidade".
 * Aceita organizationId opcional para curto-circuitar quando o usuário não
 * tem org (ex.: sessão anômala) — devolve false nesse caso.
 */
export async function isOrganizationOwner(
  userId: string,
  organizationId: string | null
): Promise<boolean> {
  if (!organizationId) return false
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  })
  return org?.ownerId === userId
}
