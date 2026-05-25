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

/**
 * Visibilidade do dashboard por cargo (Etapa 3 / lacuna 2). Hierárquico:
 * cada seção tem `access` (master) e, opcionalmente, `items` por chave. Vive sob
 * a chave reservada `dashboard` do JSON de permissões — não é um "módulo/aba".
 *
 * Default OPT-IN: ausência de seção/item ⇒ oculto. Titular e admin ignoram isto
 * (veem tudo), tratado na camada de página, não aqui.
 */
export type DashboardSectionPerm = {
  access: boolean
  items?: Record<string, boolean>
}
export type DashboardPermissions = Record<string, DashboardSectionPerm>

// A chave `dashboard` é reservada dentro do JSON de permissões e NÃO é um módulo
// de aba (não entra em clinicRoleCan/clinicRoleHasTabAccess).
export const DASHBOARD_PERM_KEY = 'dashboard'

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

/**
 * Extrai o bloco de visibilidade de dashboard do JSON de permissões. Fica sob a
 * chave reservada `dashboard`; ausência ⇒ vazio (opt-in nega tudo).
 */
export function parseDashboardPermissions(json: unknown): DashboardPermissions {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const block = (json as Record<string, unknown>)[DASHBOARD_PERM_KEY]
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      return block as DashboardPermissions
    }
  }
  return {}
}

/** Seção do dashboard visível para o cargo? Opt-in: ausência ⇒ false. */
export function dashboardSectionVisible(perms: DashboardPermissions, section: string): boolean {
  return perms[section]?.access === true
}

/**
 * Item do dashboard visível? Exige a seção liberada. Dentro de uma seção
 * liberada, item ausente em `items` ⇒ VISÍVEL (a seção liga tudo; `items` só
 * serve para desligar itens pontuais). Item explicitamente `false` ⇒ oculto.
 */
export function dashboardItemVisible(
  perms: DashboardPermissions,
  section: string,
  item: string
): boolean {
  const sec = perms[section]
  if (!sec || sec.access !== true) return false
  if (!sec.items) return true
  return sec.items[item] !== false
}
