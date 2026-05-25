/**
 * Helpers NEUTROS de permissão por cargo — núcleo compartilhado entre os dois
 * domínios de cargo (ClinicRole e AgencyRole). Operam só sobre o JSON de
 * permissões; não conhecem clínica nem agência (Isolamento Total: este é o único
 * código de cargo que cruza a fronteira, junto dos primitivos de UI).
 *
 * Um cargo guarda um JSON com uma entrada por aba (módulo): flag-mestre `access`
 * (libera/bloqueia a aba inteira) e, quando liberada, flags de ação.
 * `assignToOthers`/`viewAll` só fazem sentido nas abas relevantes (goals,
 * activities) — ver `prompt/cargos-progresso.md`, decisões D3/D4.
 */

export type RolePermAction = 'read' | 'write' | 'delete' | 'assignToOthers' | 'viewAll'

export type RoleModulePerm = {
  access: boolean
  read?: boolean
  write?: boolean
  delete?: boolean
  assignToOthers?: boolean
  viewAll?: boolean
}

export type RolePermissions = Record<string, RoleModulePerm>

/**
 * Visibilidade do dashboard por cargo. Hierárquico: cada seção tem `access`
 * (master) e, opcionalmente, `items` por chave. Vive sob a chave reservada
 * `dashboard` do JSON de permissões — não é um "módulo/aba".
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
// de aba (não entra em roleCan/roleHasTabAccess).
export const DASHBOARD_PERM_KEY = 'dashboard'

/**
 * Resolve uma ação contra o JSON de permissões de um cargo.
 * - Módulo ausente ou `access:false` ⇒ nega tudo (aba bloqueada).
 * - Caso contrário ⇒ retorna o flag da ação (default false se omisso).
 */
export function roleCan(
  permissions: RolePermissions,
  module: string,
  action: RolePermAction
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
export function roleHasTabAccess(permissions: RolePermissions, module: string): boolean {
  const mod = permissions[module]
  // Sem entrada ⇒ sem acesso (cargo restritivo por padrão). A coroa nunca passa
  // por aqui (tem acesso total antes de consultar o cargo).
  return !!mod && mod.access !== false
}

/** Coerção segura do JSON do Prisma para o shape de permissões. */
export function parseRolePermissions(json: unknown): RolePermissions {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json as RolePermissions
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

/**
 * Hierarquia LINEAR de cargos. Menor `level` = mais alto. Um ator pode atuar
 * sobre um cargo-alvo só se estiver estritamente acima dele.
 *
 * `actorLevel === null` ⇒ ator é a coroa (titular/ADMIN), acima de qualquer
 * cargo. Caso contrário compara inteiros: age só sobre `targetLevel` MAIOR.
 */
export function canActOnRoleLevel(actorLevel: number | null, targetLevel: number): boolean {
  if (actorLevel === null) return true
  return actorLevel < targetLevel
}
