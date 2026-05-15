import type { Prisma, UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type StaffUser = Awaited<ReturnType<typeof listStaff>>[number]

export async function listStaff(ctx: TenantContext) {
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
      permissions: {
        select: { module: true, canRead: true, canWrite: true, canDelete: true },
      },
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
      permissions: {
        select: { module: true, canRead: true, canWrite: true, canDelete: true },
      },
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

export async function upsertUserPermissions(
  userId: string,
  permissions: { module: string; canRead: boolean; canWrite: boolean; canDelete: boolean }[]
) {
  const operations: Prisma.PrismaPromise<unknown>[] = permissions.map((p) =>
    prisma.userPermission.upsert({
      where: { userId_module: { userId, module: p.module } },
      create: {
        userId,
        module: p.module,
        canRead: p.canRead,
        canWrite: p.canWrite,
        canDelete: p.canDelete,
      },
      update: {
        canRead: p.canRead,
        canWrite: p.canWrite,
        canDelete: p.canDelete,
      },
    })
  )
  return prisma.$transaction(operations)
}
