import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  clinicRoleCan,
  parseClinicRolePermissions,
  type ClinicPermAction,
} from './clinic-permissions'

const ROLE_DEFAULTS: Record<
  UserRole,
  Record<string, { read: boolean; write: boolean; delete: boolean }>
> = {
  ADMIN: {
    '*': { read: true, write: true, delete: true },
  },
  STAFF: {
    crm: { read: true, write: true, delete: false },
    financial: { read: true, write: false, delete: false },
    insights: { read: true, write: false, delete: false },
    goals: { read: true, write: false, delete: false },
    clients: { read: true, write: true, delete: false },
    patients: { read: true, write: false, delete: false },
    appointments: { read: true, write: false, delete: false },
    procedures: { read: true, write: false, delete: false },
    activities: { read: true, write: true, delete: false },
    reports: { read: true, write: false, delete: false },
    staff: { read: true, write: false, delete: false },
    settings: { read: false, write: false, delete: false },
  },
  CLIENT_OWNER: {
    crm: { read: true, write: true, delete: true },
    financial: { read: true, write: true, delete: true },
    insights: { read: true, write: true, delete: false },
    goals: { read: true, write: true, delete: true },
    patients: { read: true, write: true, delete: true },
    appointments: { read: true, write: true, delete: true },
    procedures: { read: true, write: true, delete: false },
    // Atividades/Calendário da clínica (reforma divisão total, Fases 3-4).
    // `activities` cobre tanto a aba Atividades quanto o CalendarEvent (o
    // calendário usa o mesmo módulo de permissão).
    activities: { read: true, write: true, delete: true },
    reports: { read: true, write: false, delete: false },
    settings: { read: true, write: true, delete: false },
  },
  CLIENT_STAFF: {
    crm: { read: true, write: true, delete: false },
    financial: { read: true, write: false, delete: false },
    insights: { read: true, write: false, delete: false },
    goals: { read: true, write: false, delete: false },
    patients: { read: true, write: true, delete: false },
    appointments: { read: true, write: true, delete: false },
    procedures: { read: true, write: false, delete: false },
    activities: { read: true, write: true, delete: false },
    reports: { read: true, write: false, delete: false },
    settings: { read: false, write: false, delete: false },
  },
}

type Action = ClinicPermAction

const CLINIC_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['CLIENT_OWNER', 'CLIENT_STAFF'])

/**
 * Resolução de permissão (ver `prompt/cargos-progresso.md`):
 *   1. ADMIN → `*` (tudo).
 *   2. Titular da clínica (Client.ownerId === userId) → tudo (a coroa).
 *   3. Role de clínica COM cargo (clinicRoleId) → lê ClinicRole.permissions.
 *   4. Fallback (sem cargo / STAFF) → ROLE_DEFAULTS + override UserPermission.
 *
 * As ações `assignToOthers`/`viewAll` só são concedidas pelo cargo (3) ou pela
 * coroa/ADMIN (1,2); no fallback (4) elas nunca passam — o caller que usa essas
 * ações deve tratar a ausência de cargo como "só vê/edita o que é seu".
 */
export async function can(
  userId: string,
  role: UserRole,
  module: string,
  action: Action
): Promise<boolean> {
  if (role === 'ADMIN') return true

  // Roles de clínica: titularidade (coroa) e cargo configurável têm prioridade.
  if (CLINIC_ROLES.has(role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        clinicRoleId: true,
        ownedClient: { select: { id: true } },
        clinicRole: { select: { permissions: true } },
      },
    })
    // Titular da clínica = acesso total.
    if (user?.ownedClient) return true
    // Tem cargo → decide pelo JSON do cargo.
    if (user?.clinicRole) {
      return clinicRoleCan(parseClinicRolePermissions(user.clinicRole.permissions), module, action)
    }
    // Sem cargo e sem coroa → cai no fallback de ROLE_DEFAULTS abaixo.
  }

  const defaults = ROLE_DEFAULTS[role]
  const defaultPerm = defaults[module] ?? defaults['*']

  if (!defaultPerm) return false

  // Ações que o fallback (ROLE_DEFAULTS/UserPermission) não modela.
  if (action === 'assignToOthers' || action === 'viewAll') return false

  // Verifica override granular salvo no banco
  const override = await prisma.userPermission.findUnique({
    where: { userId_module: { userId, module } },
  })

  if (!override) return defaultPerm[action]

  if (action === 'read') return override.canRead
  if (action === 'write') return override.canWrite
  if (action === 'delete') return override.canDelete

  return false
}

/**
 * Versão síncrona — NÃO consulta o DB, então NÃO enxerga cargo (ClinicRole) nem
 * titularidade. Use só onde o cargo é irrelevante (defaults de role) e nunca
 * como gate de segurança para roles de clínica com cargo. As ações novas
 * (`assignToOthers`/`viewAll`) não são modeladas no sync ⇒ false.
 */
export function canSync(role: UserRole, module: string, action: Action): boolean {
  if (role === 'ADMIN') return true
  if (action === 'assignToOthers' || action === 'viewAll') return false
  const defaults = ROLE_DEFAULTS[role]
  const perm = defaults[module] ?? defaults['*']
  if (!perm) return false
  return perm[action]
}
