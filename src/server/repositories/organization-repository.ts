import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export async function findCurrentOrganization(ctx: TenantContext) {
  return prisma.organization.findFirst({
    where: { id: ctx.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function updateOrganization(ctx: TenantContext, data: Partial<{ name: string }>) {
  return prisma.organization.updateMany({
    where: { id: ctx.organizationId, deletedAt: null },
    data,
  })
}
