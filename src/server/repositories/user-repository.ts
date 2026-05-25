import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type StaffUser = Awaited<ReturnType<typeof listStaff>>[number]

export async function listStaff(ctx: Pick<TenantContext, 'organizationId'>) {
  return prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId,
      role: { in: ['ADMIN', 'STAFF'] },
      deletedAt: null,
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      agencyRoleId: true,
      agencyRole: { select: { id: true, name: true, level: true } },
    },
  })
}

export async function findUserById(ctx: TenantContext, userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      agencyRoleId: true,
      agencyRole: { select: { id: true, name: true, level: true } },
    },
  })
}

export async function findUserProfileById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      organizationId: true,
      clientId: true,
    },
  })
}

export async function updateUserProfile(
  userId: string,
  data: Partial<{ name: string; image: string | null }>
) {
  return prisma.user.update({ where: { id: userId }, data })
}

export async function setUserActive(ctx: TenantContext, userId: string, isActive: boolean) {
  return prisma.user.updateMany({
    where: {
      id: userId,
      organizationId: ctx.organizationId,
      role: { in: ['ADMIN', 'STAFF'] },
      deletedAt: null,
    },
    data: { isActive },
  })
}

export async function updateUserRole(ctx: TenantContext, userId: string, role: UserRole) {
  return prisma.user.updateMany({
    where: {
      id: userId,
      organizationId: ctx.organizationId,
      role: { in: ['ADMIN', 'STAFF'] },
      deletedAt: null,
    },
    data: { role },
  })
}
