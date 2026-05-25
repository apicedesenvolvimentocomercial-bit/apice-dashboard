/**
 * Catálogo das ABAS da AGÊNCIA exibidas na matriz de permissões de um cargo de
 * agência. Espelho de `clinic-modules.ts` (Isolamento Total), mas com as abas do
 * domínio admin. Cada aba tem o flag-mestre `access` + ações; `assignToOthers`/
 * `viewAll` só nas abas que suportam (hoje Atividades).
 *
 * `dashboard`, `notifications` e `settings` NÃO entram aqui: são sempre visíveis
 * (ALWAYS_VISIBLE em agency-tabs.ts), então não há o que configurar. `audit` é
 * restrito a ADMIN no código — também fora da matriz de cargo.
 */

export type AgencyModuleKey = 'clients' | 'crm' | 'activities' | 'calendar' | 'staff'

export type AgencyModuleDef = {
  key: AgencyModuleKey
  label: string
  description: string
  assignToOthers?: boolean
  viewAll?: boolean
}

export const AGENCY_MODULES: AgencyModuleDef[] = [
  { key: 'clients', label: 'Clínicas', description: 'Gestão das clínicas da agência' },
  { key: 'crm', label: 'Pipeline', description: 'Funil comercial da agência' },
  {
    key: 'activities',
    label: 'Atividades',
    description: 'Tarefas e calendário da agência',
    assignToOthers: true,
    viewAll: true,
  },
  { key: 'calendar', label: 'Calendário', description: 'Calendário pessoal' },
  { key: 'staff', label: 'Equipe', description: 'Membros e cargos da agência' },
]
