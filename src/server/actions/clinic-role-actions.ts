'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getClinicContext, type ClinicContext } from '@/server/auth/clinic-context'
import {
  assignClinicRole,
  createClinicRole,
  deleteClinicRole,
  updateClinicRole,
} from '@/server/repositories/clinic-role-repository'
import { createAuditLog } from '@/server/repositories/audit-repository'
import { ConflictError, ForbiddenError, NotFoundError, runAction } from '@/types/errors'

/**
 * Quem pode administrar cargos (Etapa 1, Bloco C): o titular da clínica (coroa)
 * ou um usuário cujo cargo tenha `canManageRoles`. Lança ForbiddenError senão.
 */
async function assertCanManageRoles(ctx: ClinicContext): Promise<void> {
  if (ctx.isOwner) return
  if (ctx.clinicRoleId) {
    const role = await prisma.clinicRole.findUnique({
      where: { id: ctx.clinicRoleId },
      select: { canManageRoles: true },
    })
    if (role?.canManageRoles) return
  }
  throw new ForbiddenError('Sem permissão para gerenciar cargos')
}

// Permissões: shape flexível por módulo (validado leve; o repo serializa JSON).
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
  name: z.string().trim().min(2, 'Nome do cargo muito curto').max(60),
  permissions: permissionsSchema,
  canManageRoles: z.boolean().default(false),
})

export async function createClinicRoleAction(input: z.infer<typeof createRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = createRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // Nome único por clínica.
    const existing = await prisma.clinicRole.findFirst({
      where: { clientId: ctx.clientId, name: parsed.data.name },
      select: { id: true },
    })
    if (existing) throw new ConflictError('Já existe um cargo com este nome')

    const role = await createClinicRole(ctx, parsed.data)
    createAuditLog(ctx, {
      action: 'create',
      entityType: 'UserPermission',
      entityId: role.id,
      changes: { name: parsed.data.name },
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return { id: role.id }
  })
}

const updateRoleSchema = z.object({
  roleId: z.string().cuid(),
  name: z.string().trim().min(2).max(60).optional(),
  permissions: permissionsSchema.optional(),
  canManageRoles: z.boolean().optional(),
})

export async function updateClinicRoleAction(input: z.infer<typeof updateRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = updateRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { roleId, ...data } = parsed.data

    // Renomear p/ um nome já usado por outro cargo da clínica = conflito.
    if (data.name) {
      const clash = await prisma.clinicRole.findFirst({
        where: { clientId: ctx.clientId, name: data.name, id: { not: roleId } },
        select: { id: true },
      })
      if (clash) throw new ConflictError('Já existe um cargo com este nome')
    }

    const result = await updateClinicRole(ctx, roleId, data)
    if (result.count === 0) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'UserPermission',
      entityId: roleId,
      changes: data,
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return null
  })
}

const deleteRoleSchema = z.object({ roleId: z.string().cuid() })

export async function deleteClinicRoleAction(input: z.infer<typeof deleteRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = deleteRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const result = await deleteClinicRole(ctx, parsed.data.roleId)
    if (result.count === 0) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }

    createAuditLog(ctx, {
      action: 'delete',
      entityType: 'UserPermission',
      entityId: parsed.data.roleId,
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return null
  })
}

const assignRoleSchema = z.object({
  userId: z.string().cuid(),
  roleId: z.string().cuid().nullable(),
})

export async function assignClinicRoleAction(input: z.infer<typeof assignRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = assignRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // O titular não recebe cargo: a coroa já dá acesso total e o cargo seria
    // ignorado por can(). Evita confusão na UI.
    if (parsed.data.userId === ctx.userId && ctx.isOwner && parsed.data.roleId) {
      throw new ConflictError('O titular tem acesso total — não precisa de cargo')
    }

    const result = await assignClinicRole(ctx, parsed.data.userId, parsed.data.roleId)
    if (result.count === 0) {
      throw new NotFoundError('Usuário (inexistente ou de outra clínica) / cargo inválido')
    }

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'User',
      entityId: parsed.data.userId,
      changes: { clinicRoleId: parsed.data.roleId },
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return null
  })
}
