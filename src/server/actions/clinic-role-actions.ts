'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { getClinicContext, type ClinicContext } from '@/server/auth/clinic-context'
import type { ClinicRolePermissions } from '@/server/auth/clinic-permissions'
import { canActOnRoleLevel } from '@/server/auth/role-permissions'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'
import {
  assignClinicRole,
  createClinicRole,
  deleteClinicRole,
  resolveClinicActorLevel,
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

/**
 * Gate de hierarquia (ledger agency-roles, D5): o ator só atua sobre cargos de
 * level estritamente ABAIXO do seu (level maior). Coroa/titular (null) passa.
 */
async function assertLevelBelow(ctx: ClinicContext, targetLevel: number): Promise<void> {
  const actorLevel = await resolveClinicActorLevel(ctx)
  if (!canActOnRoleLevel(actorLevel, targetLevel)) {
    throw new ForbiddenError('Não é possível gerenciar um cargo no seu nível ou acima')
  }
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
// A chave reservada `dashboard` carrega visibilidade por SEÇÃO ({ access, items }),
// um shape SEM `access` no topo do bloco. O dialog a empacota dentro de
// `permissions`, então o valor do record é uma UNIÃO: módulo de aba OU bloco de
// dashboard. Sem isso o `dashboard` falhava o modulePermSchema com "Required"
// (access ausente) e quebrava a criação/edição de cargo.
const dashboardSectionSchema = z.object({
  access: z.boolean(),
  items: z.record(z.string(), z.boolean()).optional(),
})
const dashboardBlockSchema = z.record(z.string(), dashboardSectionSchema)
// Chave reservada `notifications`: preferência por categoria — boolean (liga/
// desliga tudo) ou canais ({ inApp, email }). Ausência = ligado (opt-out).
// A ORDEM da união importa: dashboard antes (exige `access`), senão um bloco
// de dashboard casaria aqui (objeto zod não-strict aceita chaves extras).
const notificationCategorySchema = z.union([
  z.boolean(),
  z.object({ inApp: z.boolean().optional(), email: z.boolean().optional() }),
])
const notificationBlockSchema = z.record(z.string(), notificationCategorySchema)
const permissionsSchema = z.record(
  z.string(),
  z.union([modulePermSchema, dashboardBlockSchema, notificationBlockSchema])
)

const createRoleSchema = z.object({
  name: z.string().trim().min(2, 'Nome do cargo muito curto').max(60),
  permissions: permissionsSchema,
  canManageRoles: z.boolean().default(false),
  level: z.number().int().min(1, 'Nível inválido'),
})

export async function createClinicRoleAction(input: z.infer<typeof createRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = createRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    // Não pode criar cargo no próprio nível ou acima.
    await assertLevelBelow(ctx, parsed.data.level)

    // Nome e nível únicos por clínica.
    const existing = await prisma.clinicRole.findFirst({
      where: {
        clientId: ctx.clientId,
        OR: [{ name: parsed.data.name }, { level: parsed.data.level }],
      },
      select: { name: true },
    })
    if (existing?.name === parsed.data.name)
      throw new ConflictError('Já existe um cargo com este nome')
    if (existing) throw new ConflictError('Já existe um cargo neste nível de hierarquia')

    // O bloco `dashboard` (chave reservada) convive no mesmo JSON de permissões; o
    // cast reconcilia a união do schema com o tipo do repo (serializado como JSON).
    const role = await createClinicRole(ctx, {
      ...parsed.data,
      permissions: parsed.data.permissions as ClinicRolePermissions,
    })
    createAuditLog(ctx, {
      action: 'create',
      entityType: 'ClinicRole',
      entityId: role.id,
      changes: { name: parsed.data.name, level: parsed.data.level },
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
  level: z.number().int().min(1).optional(),
})

export async function updateClinicRoleAction(input: z.infer<typeof updateRoleSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = updateRoleSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { roleId, ...data } = parsed.data

    const current = await prisma.clinicRole.findFirst({
      where: { id: roleId, clientId: ctx.clientId, isSystem: false },
      select: { level: true },
    })
    if (!current) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }
    // Ator precisa estar acima do cargo atual E (se mudar de nível) do novo.
    await assertLevelBelow(ctx, current.level)
    if (data.level !== undefined) await assertLevelBelow(ctx, data.level)

    // Renomear/renivelar p/ valor já usado por outro cargo da clínica = conflito.
    if (data.name || data.level !== undefined) {
      const clash = await prisma.clinicRole.findFirst({
        where: {
          clientId: ctx.clientId,
          id: { not: roleId },
          OR: [
            ...(data.name ? [{ name: data.name }] : []),
            ...(data.level !== undefined ? [{ level: data.level }] : []),
          ],
        },
        select: { name: true },
      })
      if (clash?.name === data.name) throw new ConflictError('Já existe um cargo com este nome')
      if (clash) throw new ConflictError('Já existe um cargo neste nível de hierarquia')
    }

    const result = await updateClinicRole(ctx, roleId, {
      ...data,
      permissions: data.permissions as ClinicRolePermissions | undefined,
    })
    if (result.count === 0) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'ClinicRole',
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

    const current = await prisma.clinicRole.findFirst({
      where: { id: parsed.data.roleId, clientId: ctx.clientId, isSystem: false },
      select: { level: true },
    })
    if (!current) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }
    await assertLevelBelow(ctx, current.level)

    const result = await deleteClinicRole(ctx, parsed.data.roleId)
    if (result.count === 0) {
      throw new NotFoundError('Cargo (inexistente, de outra clínica, ou cargo de sistema)')
    }

    createAuditLog(ctx, {
      action: 'delete',
      entityType: 'ClinicRole',
      entityId: parsed.data.roleId,
    }).catch(() => {})

    revalidatePath('/configuracoes')
    return null
  })
}

const reorderRolesSchema = z.object({ orderedIds: z.array(z.string().cuid()).min(1) })

/**
 * Reordena a hierarquia de cargos arrastando (item 8, estilo Discord). A nova
 * ordem reatribui os MESMOS `level` (do topo p/ baixo) aos cargos. Só atua sobre
 * os cargos que o ator pode gerenciar (level abaixo do seu); `orderedIds` precisa
 * ser uma permutação exata desse conjunto. Reescreve em 2 fases (levels temporários
 * negativos → finais) p/ não violar a unique [clientId, level] durante o swap.
 */
export async function reorderClinicRolesAction(input: z.infer<typeof reorderRolesSchema>) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCanManageRoles(ctx)

    const parsed = reorderRolesSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const actorLevel = await resolveClinicActorLevel(ctx)
    const roles = await prisma.clinicRole.findMany({
      where: { clientId: ctx.clientId, isSystem: false },
      select: { id: true, level: true },
      orderBy: { level: 'asc' },
    })
    const manageable = roles.filter((r) => canActOnRoleLevel(actorLevel, r.level))
    const manageableIds = new Set(manageable.map((r) => r.id))

    if (
      parsed.data.orderedIds.length !== manageable.length ||
      !parsed.data.orderedIds.every((id) => manageableIds.has(id))
    ) {
      throw new ConflictError('Ordem inválida')
    }

    const levels = manageable.map((r) => r.level).sort((a, b) => a - b)
    const assignments = parsed.data.orderedIds.map((id, i) => ({ id, level: levels[i] }))
    const currentLevelById = new Map(manageable.map((r) => [r.id, r.level]))
    if (assignments.every((a) => currentLevelById.get(a.id) === a.level)) return null

    await scopedTransaction(async (tx) => {
      // Fase 1: levels temporários negativos (únicos, fora do espaço positivo).
      for (let i = 0; i < assignments.length; i++) {
        await tx.clinicRole.update({ where: { id: assignments[i].id }, data: { level: -(i + 1) } })
      }
      // Fase 2: levels finais.
      for (const a of assignments) {
        await tx.clinicRole.update({ where: { id: a.id }, data: { level: a.level } })
      }
    })

    createAuditLog(ctx, {
      action: 'update',
      entityType: 'ClinicRole',
      entityId: 'reorder',
      changes: { order: parsed.data.orderedIds },
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

    // Gate de hierarquia (D5): ator precisa estar acima do cargo ATUAL do alvo
    // (não mexe em par/superior) e do cargo NOVO (não promove a nível >= ao seu).
    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, clientId: ctx.clientId },
      select: { clinicRole: { select: { level: true } } },
    })
    if (target?.clinicRole) await assertLevelBelow(ctx, target.clinicRole.level)
    if (parsed.data.roleId) {
      const newRole = await prisma.clinicRole.findFirst({
        where: { id: parsed.data.roleId, clientId: ctx.clientId },
        select: { level: true },
      })
      if (!newRole) throw new NotFoundError('Cargo inválido')
      await assertLevelBelow(ctx, newRole.level)
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
