/**
 * Formatação numérica do dashboard do redesign (handoff §5/§6): valores de KPI
 * sem centavos, rótulos compactos p/ gráficos ("232k") e percentuais pt-BR.
 * Tudo puro — sem React, importável por server e client components.
 */

/** R$ sem centavos (valores de KPI — "R$ 184.320"). */
export function formatBRL0(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Compacto p/ rótulos de barra/eixo: 184320 → "184k"; 950 → "950". */
export function compactK(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const k = value / 1000
    const rounded = Math.abs(k) >= 100 ? Math.round(k) : Math.round(k * 10) / 10
    return `${String(rounded).replace('.', ',')}k`
  }
  return String(Math.round(value))
}

/** R$ compacto p/ listas densas ("R$ 232k"). */
export function formatBRLCompact(value: number): string {
  return `R$ ${compactK(value)}`
}

/** Fração 0..1 → "12,4%" (uma casa, vírgula pt-BR). */
export function formatPct1(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')}%`
}
