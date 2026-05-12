export type GoalView = {
  id: string
  metric:
    | 'REVENUE'
    | 'LEADS'
    | 'CONVERSION_RATE'
    | 'NO_SHOW_RATE'
    | 'AVERAGE_TICKET'
    | 'APPOINTMENTS'
    | 'NEW_PATIENTS'
  period: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  targetValue: number
  currentValue: number
  progressPct: number
  daysLeft: number
  projectedAtPace: number | null
  startDate: Date
  endDate: Date
  notes: string | null
}

export const METRIC_LABEL: Record<GoalView['metric'], string> = {
  REVENUE: 'Receita',
  LEADS: 'Leads',
  CONVERSION_RATE: 'Taxa de conversão',
  NO_SHOW_RATE: 'Taxa de no-show',
  AVERAGE_TICKET: 'Ticket médio',
  APPOINTMENTS: 'Agendamentos',
  NEW_PATIENTS: 'Novos pacientes',
}

export const PERIOD_LABEL: Record<GoalView['period'], string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
}
