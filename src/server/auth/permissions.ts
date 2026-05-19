import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'

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
    reports: { read: true, write: false, delete: false },
    settings: { read: false, write: false, delete: false },
  },
}

type Action = 'read' | 'write' | 'delete'

export async function can(
  userId: string,
  role: UserRole,
  module: string,
  action: Action
): Promise<boolean> {
  if (role === 'ADMIN') return true

  const defaults = ROLE_DEFAULTS[role]
  const defaultPerm = defaults[module] ?? defaults['*']

  if (!defaultPerm) return false

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

export function canSync(role: UserRole, module: string, action: Action): boolean {
  if (role === 'ADMIN') return true
  const defaults = ROLE_DEFAULTS[role]
  const perm = defaults[module] ?? defaults['*']
  if (!perm) return false
  return perm[action]
}
