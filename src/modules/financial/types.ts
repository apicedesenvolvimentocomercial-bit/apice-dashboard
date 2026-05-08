import type { CostRow } from '@/server/repositories/cost-repository'
import type { RevenueRow } from '@/server/repositories/revenue-repository'
import type { ProcedureWithStats } from '@/server/repositories/procedure-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'

export type { RevenueRow, CostRow, ProcedureWithStats, ProcedureForSelect }

export type FinancialSummary = {
  current: { revenue: number; costs: number; profit: number; margin: number; count: number }
  previous: { revenue: number; costs: number; profit: number; margin: number }
}

export type ChartMonth = { month: string; revenue: number; costs: number }

export const COST_TYPE_LABELS: Record<string, string> = {
  FIXED: 'Fixo',
  VARIABLE: 'Variável',
  MARKETING: 'Marketing',
  PAYROLL: 'Folha',
  TAX: 'Imposto',
  OTHER: 'Outro',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão crédito',
  DEBIT_CARD: 'Cartão débito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
}

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS)

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatPercent(value: number) {
  return value.toFixed(1) + '%'
}
