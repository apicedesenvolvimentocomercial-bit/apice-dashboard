/**
 * Rótulos legíveis de metas — compartilhados entre camadas (server query/serviço
 * que produz + componentes de render que consomem) e domínios. São DADOS PUROS:
 * sem React, sem server, sem regra de domínio. Vivem em `src/shared` para que o
 * server (PDF de relatório, regras de insight) os importe sem inverter o layering.
 *
 * As chaves espelham o enum Prisma `GoalMetric` / `GoalPeriod`. Sempre exibir o
 * rótulo (português, sem CAPSLOCK/underline), nunca o valor cru do enum.
 */
export type GoalMetricKey =
  | 'REVENUE'
  | 'LEADS'
  | 'CONVERSION_RATE'
  | 'NO_SHOW_RATE'
  | 'AVERAGE_TICKET'
  | 'APPOINTMENTS'
  | 'NEW_PATIENTS'

export type GoalPeriodKey = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export const METRIC_LABEL: Record<GoalMetricKey, string> = {
  REVENUE: 'Receita',
  LEADS: 'Leads',
  CONVERSION_RATE: 'Taxa de conversão',
  NO_SHOW_RATE: 'Taxa de no-show',
  AVERAGE_TICKET: 'Ticket médio',
  APPOINTMENTS: 'Agendamentos',
  NEW_PATIENTS: 'Novos pacientes',
}

export const PERIOD_LABEL: Record<GoalPeriodKey, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  YEARLY: 'Anual',
}

/** Rótulo seguro p/ valor de métrica (cai no próprio valor se desconhecido). */
export function metricLabel(metric: string): string {
  return METRIC_LABEL[metric as GoalMetricKey] ?? metric
}

/**
 * Métricas cujo valor é uma FRAÇÃO (0..1) representando porcentagem. Armazenadas
 * como fração no banco (`Goal.targetValue` = 0.6), exibidas como % (×100). O input
 * de meta aceita o número humano (60) e converte na borda.
 */
export function isPercentMetric(metric: string): boolean {
  return metric === 'CONVERSION_RATE' || metric === 'NO_SHOW_RATE'
}
