'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { getClinicContext } from '@/server/auth/clinic-context'
import { ConflictError, ForbiddenError, NotFoundError, runAction } from '@/types/errors'

const transferClinicOwnershipSchema = z.object({
  targetUserId: z.string().cuid(),
})

/**
 * Transfere a titularidade (coroa) da clínica para outro usuário (Etapa 1 — D7,
 * análogo ao `transferOwnershipAction` do admin).
 * - Apenas o titular atual pode invocar.
 * - O alvo precisa estar ativo, ser CLIENT_OWNER e pertencer à mesma clínica.
 * - O titular atual permanece CLIENT_OWNER, mas perde a coroa.
 */
export async function transferClinicOwnershipAction(
  input: z.infer<typeof transferClinicOwnershipSchema>
) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    if (!ctx.isOwner) {
      throw new ForbiddenError('Apenas o titular da clínica pode transferir a titularidade')
    }

    const parsed = transferClinicOwnershipSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    if (parsed.data.targetUserId === ctx.userId) {
      throw new ConflictError('Você já é o titular — escolha outro usuário')
    }

    const target = await prisma.user.findFirst({
      where: {
        id: parsed.data.targetUserId,
        clientId: ctx.clientId,
        organizationId: ctx.organizationId,
        deletedAt: null,
        isActive: true,
        role: 'CLIENT_OWNER',
      },
      select: { id: true, name: true },
    })
    if (!target) {
      throw new NotFoundError('Usuário-alvo (precisa ser CLIENT_OWNER ativo na clínica)')
    }

    // Move a coroa. Condicional em ownerId atual = defesa contra corrida.
    const moved = await prisma.client.updateMany({
      where: { id: ctx.clientId, ownerId: ctx.userId },
      data: { ownerId: target.id },
    })
    if (moved.count === 0) {
      throw new ConflictError('A titularidade mudou — recarregue e tente de novo')
    }

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'Client',
      entityId: ctx.clientId,
      changes: { ownerId: { from: ctx.userId, to: target.id } },
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return null
  })
}
