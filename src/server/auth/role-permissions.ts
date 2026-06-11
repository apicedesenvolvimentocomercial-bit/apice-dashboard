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
 * Preferências de NOTIFICAÇÃO por cargo. Vivem sob a chave reservada
 * `notifications` do mesmo JSON de permissões (espelha o padrão `dashboard`) —
 * não é um módulo/aba e NÃO entra em roleCan/roleHasTabAccess.
 *
 * Default OPT-OUT (contrário do dashboard): categoria/canal ausente ⇒ LIGADO.
 * Notificação é útil por padrão; o cargo desliga o que não quer. `true` liga
 * tudo; `false` desliga tudo; objeto controla canal a canal (inApp/email).
 * Titular/admin ignoram isto (coroa não consulta cargo) — tratado no dispatch.
 */
export type NotificationCategoryPerm = boolean | { inApp?: boolean; email?: boolean }
export type NotificationPermissions = Record<string, NotificationCategoryPerm>

export const NOTIFICATION_PERM_KEY = 'notifications'

/** Extrai o bloco `notifications` do JSON de permissões (ausente ⇒ vazio = tudo ligado). */
export function parseNotificationPermissions(json: unknown): NotificationPermissions {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const block = (json as Record<string, unknown>)[NOTIFICATION_PERM_KEY]
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      return block as NotificationPermissions
    }
  }
  return {}
}

/** Canal habilitado p/ a categoria? Opt-out: ausência ⇒ true. */
export function notificationChannelEnabled(
  perms: NotificationPermissions,
  category: string,
  channel: 'inApp' | 'email'
): boolean {
  const cat = perms[category]
  if (cat === undefined) return true
  if (typeof cat === 'boolean') return cat
  return cat[channel] !== false
}

/**
 * ANTI-ESCALAÇÃO (princípio do subconjunto): um gestor de cargos NÃO pode
 * conceder a um cargo nenhuma capacidade que ele próprio não tenha — senão
 * quem tem `canManageRoles` se auto-promove via cargo-fantoche (ex.: sem
 * `staff:write` não pode criar cargo que convida pessoas).
 *
 * Compara o JSON CONCEDIDO contra o do ATOR e retorna as violações
 * ("module:action" / "dashboard:section[.item]"). Vazio = ok. Regras:
 * - Módulo/ação: flag true no concedido exige o mesmo true no ator (via
 *   roleCan — module com access:false nega tudo).
 * - Dashboard (visibilidade É exposição de dado): seção ligada exige seção do
 *   ator ligada; item que o ator tem DESLIGADO precisa estar desligado também
 *   no concedido (ausente = visível).
 * - `notifications` fica de fora: é preferência de aviso, não capacidade (o
 *   dispatch já filtra destinatário por module:read).
 * O TITULAR não passa por aqui (coroa concede qualquer coisa).
 */
const SUBSET_ACTIONS: RolePermAction[] = ['read', 'write', 'delete', 'assignToOthers', 'viewAll']

export function findPermissionEscalations(
  granted: RolePermissions,
  actor: RolePermissions
): string[] {
  const violations: string[] = []

  for (const [key, value] of Object.entries(granted)) {
    if (key === NOTIFICATION_PERM_KEY) continue

    if (key === DASHBOARD_PERM_KEY) {
      const grantedDash = (value ?? {}) as unknown as DashboardPermissions
      const actorDash = (actor[DASHBOARD_PERM_KEY] ?? {}) as unknown as DashboardPermissions
      for (const [section, sec] of Object.entries(grantedDash)) {
        if (sec?.access !== true) continue
        if (!dashboardSectionVisible(actorDash, section)) {
          violations.push(`dashboard:${section}`)
          continue
        }
        // Itens que o ator tem desligados não podem nascer ligados no cargo.
        const actorItems = actorDash[section]?.items ?? {}
        for (const [item, on] of Object.entries(actorItems)) {
          if (on === false && sec.items?.[item] !== false) {
            violations.push(`dashboard:${section}.${item}`)
          }
        }
      }
      continue
    }

    const mod = value as RoleModulePerm | undefined
    if (!mod || mod.access !== true) continue
    if (!roleHasTabAccess(actor, key)) {
      violations.push(`${key}:access`)
      continue
    }
    for (const action of SUBSET_ACTIONS) {
      if (mod[action] === true && !roleCan(actor, key, action)) {
        violations.push(`${key}:${action}`)
      }
    }
  }

  return violations
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
