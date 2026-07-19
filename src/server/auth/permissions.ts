import type { UserRole } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { roleCan, parseRolePermissions, type RolePermAction } from './role-permissions'

/**
 * DENY-BY-DEFAULT (ledger agency-roles, D3). O role NÃO concede mais nenhuma
 * permissão por si — ele só discrimina o domínio (ADMIN/STAFF = agência;
 * CLIENT_OWNER/CLIENT_STAFF = clínica). Toda permissão vem da COROA (titular/
 * ADMIN) ou de um CARGO atribuído (AgencyRole/ClinicRole). Sem cargo e sem coroa
 * ⇒ zero acesso (o gate de rota redireciona p/ /login).
 *
 * Mantido só p/ enumerar os módulos conhecidos por domínio (sidebar/validação),
 * todos com acesso negado — nunca mais como fonte de concessão.
 */
const ALL_FALSE = { read: false, write: false, delete: false } as const

type Action = RolePermAction

const AGENCY_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['ADMIN', 'STAFF'])
const CLINIC_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(['CLIENT_OWNER', 'CLIENT_STAFF'])

/**
 * Resolução de permissão (ledger agency-roles, D3 — deny-by-default):
 *   1. ADMIN → tudo (a coroa da agência; titularidade de org não importa p/ acesso).
 *   2. Titular da clínica (Client.ownerId === userId) → tudo (a coroa da clínica).
 *   3. STAFF com cargo de agência (agencyRoleId) → lê AgencyRole.permissions.
 *   4. CLIENT_STAFF/OWNER com cargo de clínica (clinicRoleId) → lê ClinicRole.permissions.
 *   5. Qualquer outro (sem cargo, sem coroa) → NEGADO. (deny-by-default)
 *
 * `assignToOthers`/`viewAll` só vêm do cargo (3,4) ou da coroa/ADMIN (1,2).
 */
export async function can(
  userId: string,
  role: UserRole,
  module: string,
  action: Action
): Promise<boolean> {
  // 1. ADMIN = coroa da agência → acesso total.
  if (role === 'ADMIN') return true

  // Domínio agência: STAFF resolve pelo cargo de agência.
  if (AGENCY_ROLES.has(role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { agencyRole: { select: { permissions: true } } },
    })
    if (user?.agencyRole) {
      return roleCan(parseRolePermissions(user.agencyRole.permissions), module, action)
    }
    // STAFF sem cargo → deny-by-default.
    return false
  }

  // Domínio clínica: titularidade (coroa) e cargo têm prioridade.
  if (CLINIC_ROLES.has(role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ownedClient: { select: { id: true } },
        clinicRole: { select: { permissions: true } },
      },
    })
    // 2. Titular da clínica = acesso total.
    if (user?.ownedClient) return true
    // 4. Tem cargo → decide pelo JSON do cargo.
    if (user?.clinicRole) {
      return roleCan(parseRolePermissions(user.clinicRole.permissions), module, action)
    }
    // 5. Sem cargo e sem coroa → deny-by-default.
    return false
  }

  return false
}

/**
 * Resolução em LOTE — MESMA ordem de decisão do `can()`, mas com 1 única query:
 * busca coroa+cargo uma vez e devolve um checador SÍNCRONO. Use quando a mesma
 * request precisa de VÁRIAS decisões (ex.: card do cliente) — n×`can()` viram
 * 1 query. Não guarde o checador além do request: cargo/coroa mudam a qualquer
 * momento e a decisão deve ser fresca por request, igual ao `can()`.
 */
export async function getPermissionChecker(
  userId: string,
  role: UserRole
): Promise<(module: string, action: Action) => boolean> {
  if (role === 'ADMIN') return () => true

  if (AGENCY_ROLES.has(role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { agencyRole: { select: { permissions: true } } },
    })
    if (!user?.agencyRole) return () => false
    const perms = parseRolePermissions(user.agencyRole.permissions)
    return (module, action) => roleCan(perms, module, action)
  }

  if (CLINIC_ROLES.has(role)) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ownedClient: { select: { id: true } },
        clinicRole: { select: { permissions: true } },
      },
    })
    if (user?.ownedClient) return () => true
    if (!user?.clinicRole) return () => false
    const perms = parseRolePermissions(user.clinicRole.permissions)
    return (module, action) => roleCan(perms, module, action)
  }

  return () => false
}

/**
 * Versão síncrona — NÃO consulta o DB, então NÃO enxerga cargo nem titularidade.
 * Com deny-by-default, sem DB não há como conceder nada exceto ADMIN. Use só
 * onde a ausência de concessão é o resultado seguro desejado; nunca como gate
 * que precise enxergar cargo.
 */
export function canSync(role: UserRole, _module: string, _action: Action): boolean {
  return role === 'ADMIN'
}

// Re-export p/ quem listava módulos conhecidos (todos negados agora).
export { ALL_FALSE }
