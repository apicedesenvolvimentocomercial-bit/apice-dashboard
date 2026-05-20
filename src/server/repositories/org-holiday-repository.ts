import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export async function listOrgHolidays(ctx: TenantContext, range?: { from: string; to: string }) {
  return prisma.orgHoliday.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(range ? { date: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, name: true },
  })
}

export async function upsertOrgHoliday(ctx: TenantContext, data: { date: string; name: string }) {
  return prisma.orgHoliday.upsert({
    where: { organizationId_date: { organizationId: ctx.organizationId, date: data.date } },
    create: { organizationId: ctx.organizationId, date: data.date, name: data.name },
    update: { name: data.name },
  })
}

export async function deleteOrgHoliday(ctx: TenantContext, id: string) {
  return prisma.orgHoliday.deleteMany({
    where: { id, organizationId: ctx.organizationId },
  })
}
