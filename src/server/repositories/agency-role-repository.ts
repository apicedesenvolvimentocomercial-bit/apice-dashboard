import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/auth/admin-context'
import type { RolePermissions } from '@/server/auth/role-permissions'

/**
 * CRUD dos cargos configuráveis da AGÊNCIA. Espelho isolado de
 * `clinic-role-repository.ts` (Isolamento Total / D1), escopado por
 * `ctx.organizationId`. AgencyRole não tem cargo de sistema "Titular" — a coroa
 * da agência é Organization.ownerId + ADMIN.
 */

export async function listAgencyRoles(ctx: AdminContext) {
  return prisma.agencyRole.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      permissions: true,
      canManageRoles: true,
      level: true,
      _count: { select: { users: true } },
    },
  })
}

export async function findAgencyRole(ctx: AdminContext, roleId: string) {
  return prisma.agencyRole.findFirst({
    where: { id: roleId, organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      permissions: true,
      canManageRoles: true,
      level: true,
    },
  })
}

export async function createAgencyRole(
  ctx: AdminContext,
  data: { name: string; permissions: RolePermissions; canManageRoles: boolean; level: number }
) {
  return prisma.agencyRole.create({
    data: {
      organizationId: ctx.organizationId,
      name: data.name,
      permissions: data.permissions as Prisma.InputJsonValue,
      canManageRoles: data.canManageRoles,
      level: data.level,
    },
    select: { id: true },
  })
}

export async function updateAgencyRole(
  ctx: AdminContext,
  roleId: string,
  data: { name?: string; permissions?: RolePermissions; canManageRoles?: boolean; level?: number }
) {
  // updateMany p/ garantir o filtro por organizationId no WHERE. Retorna count.
  return prisma.agencyRole.updateMany({
    where: { id: roleId, organizationId: ctx.organizationId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.permissions !== undefined
        ? { permissions: data.permissions as Prisma.InputJsonValue }
        : {}),
      ...(data.canManageRoles !== undefined ? { canManageRoles: data.canManageRoles } : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
    },
  })
}

export async function deleteAgencyRole(ctx: AdminContext, roleId: string) {
  // Usuários com este cargo ficam com agencyRoleId null (FK onDelete: SetNull)
  // → caem no deny-by-default até receberem outro cargo.
  return prisma.agencyRole.deleteMany({
    where: { id: roleId, organizationId: ctx.organizationId },
  })
}

/** Usuários internos da agência (ADMIN/STAFF) p/ atribuir cargo e exibir a coroa. */
export async function listAgencyUsers(ctx: AdminContext) {
  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { ownerId: true },
  })
  const users = await prisma.user.findMany({
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
      agencyRoleId: true,
      agencyRole: { select: { id: true, name: true, level: true } },
    },
  })
  return users.map((u) => ({ ...u, isOwner: u.id === org?.ownerId }))
}

/** Atribui (ou remove, com roleId null) um cargo de agência a um usuário. */
export async function assignAgencyRole(ctx: AdminContext, userId: string, roleId: string | null) {
  return prisma.user.updateMany({
    where: { id: userId, organizationId: ctx.organizationId, role: { in: ['ADMIN', 'STAFF'] } },
    data: { agencyRoleId: roleId },
  })
}

/** Nível efetivo do ator p/ gate de hierarquia: coroa (titular/ADMIN) ⇒ null
 *  (acima de tudo); senão o level do próprio cargo de agência. */
export async function resolveActorLevel(ctx: AdminContext): Promise<number | null> {
  if (ctx.isOwner || ctx.role === 'ADMIN') return null
  if (!ctx.agencyRoleId) return null // sem cargo não gerencia (barrado antes), neutro aqui
  const role = await prisma.agencyRole.findUnique({
    where: { id: ctx.agencyRoleId },
    select: { level: true },
  })
  return role?.level ?? null
}
