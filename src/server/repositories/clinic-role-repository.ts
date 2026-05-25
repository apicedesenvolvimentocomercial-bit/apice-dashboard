import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'
import type { ClinicRolePermissions } from '@/server/auth/clinic-permissions'

/**
 * CRUD dos cargos configuráveis da clínica (Etapa 1, Bloco C). Sempre escopado
 * por `ctx.clientId` — a RLS (policy tenant_isolation em ClinicRole) é a defesa
 * em profundidade, mas o filtro explícito é a primeira linha.
 */

export async function listClinicRoles(ctx: ClinicContext) {
  return prisma.clinicRole.findMany({
    where: { clientId: ctx.clientId },
    orderBy: [{ level: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      permissions: true,
      canManageRoles: true,
      isSystem: true,
      level: true,
      _count: { select: { users: true } },
    },
  })
}

export async function findClinicRole(ctx: ClinicContext, roleId: string) {
  return prisma.clinicRole.findFirst({
    where: { id: roleId, clientId: ctx.clientId },
    select: {
      id: true,
      name: true,
      permissions: true,
      canManageRoles: true,
      isSystem: true,
      level: true,
    },
  })
}

export async function createClinicRole(
  ctx: ClinicContext,
  data: { name: string; permissions: ClinicRolePermissions; canManageRoles: boolean; level: number }
) {
  return prisma.clinicRole.create({
    data: {
      clientId: ctx.clientId,
      name: data.name,
      permissions: data.permissions as Prisma.InputJsonValue,
      canManageRoles: data.canManageRoles,
      level: data.level,
    },
    select: { id: true },
  })
}

export async function updateClinicRole(
  ctx: ClinicContext,
  roleId: string,
  data: {
    name?: string
    permissions?: ClinicRolePermissions
    canManageRoles?: boolean
    level?: number
  }
) {
  // updateMany p/ garantir o filtro por clientId no WHERE (findFirst+update
  // abriria janela). Retorna count.
  return prisma.clinicRole.updateMany({
    where: { id: roleId, clientId: ctx.clientId, isSystem: false },
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

/** Nível efetivo do ator p/ gate de hierarquia: coroa (titular) ⇒ null (acima
 *  de tudo); senão o level do próprio cargo. */
export async function resolveClinicActorLevel(ctx: ClinicContext): Promise<number | null> {
  if (ctx.isOwner) return null
  if (!ctx.clinicRoleId) return null
  const role = await prisma.clinicRole.findUnique({
    where: { id: ctx.clinicRoleId },
    select: { level: true },
  })
  return role?.level ?? null
}

export async function deleteClinicRole(ctx: ClinicContext, roleId: string) {
  // Só cargos não-sistema. Usuários com este cargo ficam com clinicRoleId null
  // (FK onDelete: SetNull) → caem no fallback de ROLE_DEFAULTS.
  return prisma.clinicRole.deleteMany({
    where: { id: roleId, clientId: ctx.clientId, isSystem: false },
  })
}

/** Usuários internos da clínica (p/ atribuir cargo e exibir a coroa). */
export async function listClinicUsers(ctx: ClinicContext) {
  const client = await prisma.client.findUnique({
    where: { id: ctx.clientId },
    select: { ownerId: true },
  })
  const users = await prisma.user.findMany({
    where: {
      clientId: ctx.clientId,
      role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] },
      deletedAt: null,
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      clinicRoleId: true,
      clinicRole: { select: { id: true, name: true } },
    },
  })
  return users.map((u) => ({ ...u, isOwner: u.id === client?.ownerId }))
}

/** Atribui (ou remove, com roleId null) um cargo a um usuário da clínica. */
export async function assignClinicRole(ctx: ClinicContext, userId: string, roleId: string | null) {
  // Valida que o cargo (se houver) é da mesma clínica antes de atribuir.
  if (roleId) {
    const role = await prisma.clinicRole.findFirst({
      where: { id: roleId, clientId: ctx.clientId },
      select: { id: true },
    })
    if (!role) return { count: 0 }
  }
  return prisma.user.updateMany({
    where: { id: userId, clientId: ctx.clientId, role: { in: ['CLIENT_OWNER', 'CLIENT_STAFF'] } },
    data: { clinicRoleId: roleId },
  })
}
