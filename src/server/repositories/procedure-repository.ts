import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type ProcedureForSelect = Awaited<ReturnType<typeof listProceduresForSelect>>[number]

export async function listProceduresForSelect(ctx: TenantContext, clientId: string) {
  return prisma.procedure.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
    },
  })
}
