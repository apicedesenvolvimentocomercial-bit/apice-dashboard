'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getAdminContext, type AdminContext } from '@/server/auth/admin-context'
import { canActOnRoleLevel } from '@/server/auth/role-permissions'
import {
  assignAgencyRole,
  createAgencyRole,
  deleteAgencyRole,
  resolveActorLevel,
  updateAgencyRole,
} from '@/server/repositories/agency-role-repository'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { ConflictError, ForbiddenError, NotFoundError, runAction } from '@/types/errors'

/**
 * Quem pode administrar cargos de agência (ledger agency-roles, D5): o ADMIN
 * titular da org (coroa) ou um usuário cujo cargo tenha `canManageRoles`. STAFF
 * sem cargo / sem a flag = barrado.
 */
async function assertCanManageAgencyRoles(ctx: AdminContext): Promise<void> {
  if (ctx.isOwner || ctx.role === 'ADMIN') return
  if (ctx.agencyRoleId) {
    const role = await prisma.agencyRole.findUnique({
      where: { id: ctx.agencyRoleId },
      select: { canManageRoles: true },
    })
    if (role?.canManageRoles) return
  }
  throw new ForbiddenError('Sem permissão para gerenciar cargos')
}

/**
 * Gate de hierarquia (D5): o ator só pode criar/editar/atribuir cargos de level
 * estritamente ABAIXO do seu (level maior). Coroa/ADMIN (actorLevel null) passa.
 * `targetLevel` é o nível do cargo sendo manipulado.
 */
async function assertLevelBelow(ctx: AdminContext, targetLevel: number): Promise<void> {
  const actorLevel = await resolveActorLevel(ctx)
  if (!canActOnRoleLevel(actorLevel, targetLevel)) {
    throw new ForbiddenError('Não é possível gerenciar um cargo no seu nível ou acima')
  }
}

const modulePermSchema = z.object({
  access: z.boolean(),
  read: z.boolean().optional(),
  write: z.boolean().optional(),
  delete: z.boolean().optional(),
  assignToOthers: z.boolean().optional(),
  viewAll: z.boolean().optional(),
})
const permissionsSchema = z.record(z.string(), modulePermSchema)

const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nome do cargo muito curto')
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O texto contém caracteres inválidos'
    ),
  permissions: permissionsSchema,
  canManageRoles: z.boolean().default(false),
  level: z
    .number()
    .int()
    .min(1, 'Nível inválido')
    .max(1000, 'Nível do cargo muito grande (limite: 1000)'),
})

export async function createAgencyRoleAction(input: z.infer<typeof createRoleSchema>) {
  return runAction(async () => {
    const ctx = await getAdminContext()
    await assertCanManageAgencyRoles(ctx)

    const parsed = createRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // Não pode criar cargo no próprio nível ou acima.
    await assertLevelBelow(ctx, parsed.data.level)

    // Nome e nível únicos por org.
    const clash = await prisma.agencyRole.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ name: parsed.data.name }, { level: parsed.data.level }],
      },
      select: { name: true, level: true },
    })
    if (clash?.name === parsed.data.name)
      throw new ConflictError('Já existe um cargo com este nome')
    if (clash) throw new ConflictError('Já existe um cargo neste nível de hierarquia')

    const role = await createAgencyRole(ctx, parsed.data)
    createAuditLog(ctx, {
      action: 'create',
      entityType: 'AgencyRole',
      entityId: role.id,
      changes: { name: parsed.data.name, level: parsed.data.level },
    }).catch(() => {})

    revalidatePath('/staff')
    return { id: role.id }
  })
}

const updateRoleSchema = z.object({
  roleId: z.string().cuid(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(255, 'Nome muito grande')
    .regex(
      /^[a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.,;:!?()'"\-\–\—\/*_+=@#%&]+$/,
      'O texto contém caracteres inválidos'
    )
    .optional(),
  permissions: permissionsSchema.optional(),
  canManageRoles: z.boolean().optional(),
  level: z.number().int().min(1).max(1000, 'Nível do cargo muito grande (limite: 1000)').optional(),
})

export async function updateAgencyRoleAction(input: z.infer<typeof updateRoleSchema>) {
  return runAction(async () => {
    const ctx = await getAdminContext()
    await assertCanManageAgencyRoles(ctx)

    const parsed = updateRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { roleId, ...data } = parsed.data

    const current = await prisma.agencyRole.findFirst({
      where: { id: roleId, organizationId: ctx.organizationId },
      select: { level: true },
    })
    if (!current) throw new NotFoundError('Cargo (inexistente ou de outra organização)')

    // O ator precisa estar acima do cargo atual E (se mudar de nível) do novo nível.
    await assertLevelBelow(ctx, current.level)
    if (data.level !== undefined) await assertLevelBelow(ctx, data.level)

    if (data.name || data.level !== undefined) {
      const clash = await prisma.agencyRole.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: { not: roleId },
          OR: [
            ...(data.name ? [{ name: data.name }] : []),
            ...(data.level !== undefined ? [{ level: data.level }] : []),
          ],
        },
        select: { name: true, level: true },
      })
      if (clash?.name === data.name) throw new ConflictError('Já existe um cargo com este nome')
      if (clash) throw new ConflictError('Já existe um cargo neste nível de hierarquia')
    }

    const result = await updateAgencyRole(ctx, roleId, data)
    if (result.count === 0) throw new NotFoundError('Cargo (inexistente ou de outra organização)')

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'AgencyRole',
      entityId: roleId,
      changes: data,
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}

const deleteRoleSchema = z.object({ roleId: z.string().cuid() })

export async function deleteAgencyRoleAction(input: z.infer<typeof deleteRoleSchema>) {
  return runAction(async () => {
    const ctx = await getAdminContext()
    await assertCanManageAgencyRoles(ctx)

    const parsed = deleteRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const current = await prisma.agencyRole.findFirst({
      where: { id: parsed.data.roleId, organizationId: ctx.organizationId },
      select: { level: true },
    })
    if (!current) throw new NotFoundError('Cargo (inexistente ou de outra organização)')
    await assertLevelBelow(ctx, current.level)

    const result = await deleteAgencyRole(ctx, parsed.data.roleId)
    if (result.count === 0) throw new NotFoundError('Cargo (inexistente ou de outra organização)')

    createAuditLog(ctx, {
      action: 'delete',
      entityType: 'AgencyRole',
      entityId: parsed.data.roleId,
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}

const assignRoleSchema = z.object({
  userId: z.string().cuid(),
  roleId: z.string().cuid().nullable(),
})

export async function assignAgencyRoleAction(input: z.infer<typeof assignRoleSchema>) {
  return runAction(async () => {
    const ctx = await getAdminContext()
    await assertCanManageAgencyRoles(ctx)

    const parsed = assignRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // O ADMIN titular não recebe cargo: a coroa já dá acesso total.
    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: ctx.organizationId },
      select: { id: true, agencyRole: { select: { level: true } } },
    })
    if (!target) throw new NotFoundError('Usuário (inexistente ou de outra organização)')

    // Gate de hierarquia: o ator precisa estar acima do cargo ATUAL do alvo
    // (não pode mexer em par/superior) E acima do cargo NOVO (não pode promover
    // a um nível >= ao seu).
    if (target.agencyRole) await assertLevelBelow(ctx, target.agencyRole.level)
    if (parsed.data.roleId) {
      const newRole = await prisma.agencyRole.findFirst({
        where: { id: parsed.data.roleId, organizationId: ctx.organizationId },
        select: { level: true },
      })
      if (!newRole) throw new NotFoundError('Cargo inválido')
      await assertLevelBelow(ctx, newRole.level)
    }

    const result = await assignAgencyRole(ctx, parsed.data.userId, parsed.data.roleId)
    if (result.count === 0) throw new NotFoundError('Usuário (inexistente ou de outra organização)')

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'User',
      entityId: parsed.data.userId,
      changes: { agencyRoleId: parsed.data.roleId },
    }).catch(() => {})

    revalidatePath('/staff')
    return null
  })
}
