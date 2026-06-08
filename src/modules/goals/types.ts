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
  // Etapa 2 — escopo.
  scopeType: 'CLINIC' | 'USER' | 'ROLE'
  mode: 'INDIVIDUAL' | 'SHARED'
  scopeLabel: string
  memberUserId: string | null
  // Alvo bruto (p/ pré-preencher o dialog de edição — lacuna 1).
  assigneeUserId: string | null
  assigneeRoleId: string | null
}

export type GoalAssignTarget = { id: string; name: string }

// Rótulos canônicos vivem em `@/shared/goal-labels` (server + UI). Reexport p/ compat.
export { METRIC_LABEL, PERIOD_LABEL } from '@/shared/goal-labels'
