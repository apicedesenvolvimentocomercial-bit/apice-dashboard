/**
 * Tipos e helpers do sistema de CARGOS configuráveis da clínica (Etapa 1).
 *
 * Um cargo (`ClinicRole`) guarda um JSON de permissões com uma entrada por aba
 * (módulo). Cada entrada tem um flag-mestre `access` (libera/bloqueia a aba
 * inteira) e, quando liberada, flags de ação. `assignToOthers`/`viewAll` só
 * fazem sentido nas abas relevantes (goals, activities) — ver `prompt/
 * cargos-progresso.md`, decisões D3/D4.
 */

export type ClinicPermAction = 'read' | 'write' | 'delete' | 'assignToOthers' | 'viewAll'

export type ClinicModulePerm = {
  access: boolean
  read?: boolean
  write?: boolean
  delete?: boolean
  assignToOthers?: boolean
  viewAll?: boolean
}

export type ClinicRolePermissions = Record<string, ClinicModulePerm>

/**
 * Resolve uma ação contra o JSON de permissões de um cargo.
 * - Módulo ausente ou `access:false` ⇒ nega tudo (aba bloqueada).
 * - Caso contrário ⇒ retorna o flag da ação (default false se omisso).
 */
export function clinicRoleCan(
  permissions: ClinicRolePermissions,
  module: string,
  action: ClinicPermAction
): boolean {
  const mod = permissions[module]
  if (!mod || mod.access === false) return false
  if (action === 'read') return mod.read ?? false
  if (action === 'write') return mod.write ?? false
  if (action === 'delete') return mod.delete ?? false
  if (action === 'assignToOthers') return mod.assignToOthers ?? false
  if (action === 'viewAll') return mod.viewAll ?? false
  return false
}

/** Aba (módulo) liberada na sidebar/rota? `access` !== false. */
export function clinicRoleHasTabAccess(
  permissions: ClinicRolePermissions,
  module: string
): boolean {
  const mod = permissions[module]
  // Sem entrada ⇒ sem acesso (cargo restritivo por padrão). O titular nunca
  // passa por aqui (tem acesso total antes de consultar o cargo).
  return !!mod && mod.access !== false
}

/** Coerção segura do JSON do Prisma para o shape de permissões. */
export function parseClinicRolePermissions(json: unknown): ClinicRolePermissions {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json as ClinicRolePermissions
  }
  return {}
}
