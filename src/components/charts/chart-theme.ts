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

/**
 * Estilos do <Tooltip> do Recharts. O default hardcoda fundo branco + texto
 * escuro inline → ignora a classe `.dark` e fica branco no tema escuro. Aqui
 * apontamos para os tokens semânticos (`--popover` etc.), que resolvem por
 * cascata do `.dark` no <html>, então o tooltip acompanha claro/escuro sem hook.
 *
 * Uso: `<Tooltip {...chartTooltipProps} formatter={...} />`. Charts que não
 * querem cursor (ex. revenue-cost-bars) passam `cursor={false}` DEPOIS do spread.
 */
export const chartTooltipProps = {
  contentStyle: {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)',
    color: 'hsl(var(--popover-foreground))',
    boxShadow: '0 4px 12px hsl(0 0% 0% / 0.1)',
  },
  labelStyle: { color: 'hsl(var(--popover-foreground))' },
  itemStyle: { color: 'hsl(var(--popover-foreground))' },
  cursor: { fill: 'hsl(var(--accent))', stroke: 'hsl(var(--border))' },
} as const
