/**
 * Catálogo de CATEGORIAS de notificação configuráveis por cargo (chave
 * reservada `notifications` do JSON de permissões — role-permissions.ts).
 * As chaves espelham CATEGORY_BY_TYPE/`category` do notification-service.
 *
 * `email: true` = a categoria tem ao menos um tipo na whitelist EMAIL_TYPES
 * (senão o checkbox de email seria placebo).
 */
export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  key: string
  label: string
  description: string
  email: boolean
}> = [
  {
    key: 'insights',
    label: 'Insights',
    description: 'Novo insight gerado para a clínica',
    email: true,
  },
  {
    key: 'goals',
    label: 'Metas',
    description: 'Meta em risco de não bater ou meta atingida',
    email: true,
  },
  {
    key: 'activities',
    label: 'Atividades',
    description: 'Tarefa próxima do prazo, atrasada ou atribuída a você',
    email: true,
  },
  {
    key: 'patients',
    label: 'Pacientes',
    description: 'Pacientes fora da janela de retorno (reativação/salvamento)',
    email: true,
  },
  {
    key: 'crm',
    label: 'CRM / Funil',
    description: 'Lead parado na etapa e desfechos de agendamento (faltou/cancelou)',
    email: false,
  },
  {
    key: 'financial',
    label: 'Financeiro',
    description: 'Parcelas a receber vencidas',
    email: false,
  },
  {
    key: 'system',
    label: 'Sistema',
    description: 'Avisos gerais do sistema',
    email: false,
  },
]
