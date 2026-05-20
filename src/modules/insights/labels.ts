import type { InsightCategory, InsightSeverity, InsightStatus } from '@prisma/client'

// Rótulos em português para os enums de Insight — mantém a UI fora dos
// valores crus em MAIÚSCULO/snake_case vindos do banco.

export const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  INFO: 'Informativo',
  WARNING: 'Aviso',
  CRITICAL: 'Crítico',
}

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  COMMERCIAL: 'Comercial',
  FINANCIAL: 'Financeiro',
  OPERATIONAL: 'Operacional',
  RETENTION: 'Retenção',
  MARKETING: 'Marketing',
}

export const STATUS_LABEL: Record<InsightStatus, string> = {
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  IN_PROGRESS: 'Em progresso',
  RESOLVED: 'Resolvido',
  DISMISSED: 'Dispensado',
}

// Helpers tolerantes a string (os componentes tipam alguns campos como string).
export function severityLabel(value: string): string {
  return SEVERITY_LABEL[value as InsightSeverity] ?? value
}
export function categoryLabel(value: string): string {
  return CATEGORY_LABEL[value as InsightCategory] ?? value
}
export function statusLabel(value: string): string {
  return STATUS_LABEL[value as InsightStatus] ?? value
}
