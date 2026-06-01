import type { ClinicTab } from '@/server/auth/clinic-tabs'

/**
 * Catálogo das ABAS da clínica exibidas na matriz de permissões de um cargo
 * (Etapa 1, Bloco C). Cada aba tem o flag-mestre `access` + ações. As flags
 * extras (`assignToOthers`/`viewAll`) só aparecem nas abas que as suportam
 * (decisões D3/D4): hoje Metas e Atividades.
 *
 * `overview`, `notificacoes` e `settings` NÃO entram aqui: são sempre visíveis
 * (ALWAYS_VISIBLE em clinic-tabs.ts), então não há o que configurar.
 */

export type ClinicModuleDef = {
  key: Exclude<ClinicTab, 'overview' | 'notificacoes' | 'settings'>
  label: string
  description: string
  // Ações configuráveis além de read/write/delete.
  assignToOthers?: boolean
  viewAll?: boolean
}

export const CLINIC_MODULES: ClinicModuleDef[] = [
  // Item 4: pipeline/agenda pessoais. `viewAll` = ver os leads/agendamentos de
  // TODOS os usuários (e as pipelines extras de todos). `assignToOthers` = poder
  // reatribuir um lead/agendamento a outro usuário.
  {
    key: 'crm',
    label: 'Pipeline',
    description: 'Funil de leads e negociações',
    assignToOthers: true,
    viewAll: true,
  },
  {
    key: 'appointments',
    label: 'Agenda',
    description: 'Agendamentos e calendário',
    assignToOthers: true,
    viewAll: true,
  },
  {
    key: 'activities',
    label: 'Atividades',
    description: 'Tarefas e calendário interno',
    assignToOthers: true,
    viewAll: true,
  },
  { key: 'patients', label: 'Pacientes', description: 'Cadastro de pacientes' },
  { key: 'financial', label: 'Financeiro', description: 'Receitas, custos e faturamento' },
  {
    key: 'goals',
    label: 'Metas',
    description: 'Metas da clínica',
    assignToOthers: true,
    viewAll: true,
  },
  { key: 'insights', label: 'Insights', description: 'Recomendações automáticas' },
  { key: 'procedures', label: 'Procedimentos', description: 'Catálogo de procedimentos' },
]
