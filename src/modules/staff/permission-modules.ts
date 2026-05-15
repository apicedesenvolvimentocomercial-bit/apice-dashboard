export type PermissionModule = {
  key: string
  label: string
  description: string
}

/**
 * Lista canônica de módulos exibida na matriz de permissões.
 * Mantida em um único lugar para que `assertCan` e a UI fiquem sincronizadas.
 */
export const PERMISSION_MODULES: PermissionModule[] = [
  { key: 'clients', label: 'Clínicas', description: 'CRUD e dashboard das clínicas' },
  { key: 'crm', label: 'CRM / Leads', description: 'Pipeline e leads' },
  { key: 'patients', label: 'Pacientes', description: 'Cadastro de pacientes' },
  { key: 'appointments', label: 'Agendamentos', description: 'Agenda e status' },
  { key: 'procedures', label: 'Procedimentos', description: 'Catálogo de procedimentos' },
  { key: 'financial', label: 'Financeiro', description: 'Receitas, custos e faturamento' },
  { key: 'insights', label: 'Insights', description: 'Motor de recomendações' },
  { key: 'goals', label: 'Metas', description: 'Metas das clínicas' },
  { key: 'activities', label: 'Atividades', description: 'Tarefas e calendário interno' },
  { key: 'reports', label: 'Relatórios', description: 'Exports e relatórios mensais' },
  { key: 'staff', label: 'Equipe', description: 'Funcionários e permissões' },
  { key: 'settings', label: 'Configurações', description: 'Organização e clínica' },
]
