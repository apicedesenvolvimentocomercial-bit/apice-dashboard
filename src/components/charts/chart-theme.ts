export const CHART_COLORS = {
  primary: '#6366f1',
  primarySoft: '#a5b4fc',
  success: '#10b981',
  successSoft: '#6ee7b7',
  danger: '#f43f5e',
  warning: '#f59e0b',
  info: '#3b82f6',
  muted: '#94a3b8',
} as const

export const CHART_PIE_PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]

export function formatBRLCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
