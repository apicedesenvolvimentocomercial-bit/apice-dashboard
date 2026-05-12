import type { InsightCategory, InsightSeverity } from '@prisma/client'

export type RuleInput = {
  organizationId: string
  clientId: string
  now: Date
}

export type InsightCandidate = {
  ruleKey: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  diagnosis: string
  estimatedImpact?: number | null
  suggestion: string
  metadata?: Record<string, unknown>
}

export type InsightRule = {
  key: string
  category: InsightCategory
  /**
   * Avalia a regra para uma clínica. Retorna candidato se a condição se
   * cumpre, ou null para "não está disparando agora" (engine vai resolver
   * insights abertos dessa regra que não voltaram).
   */
  evaluate(input: RuleInput): Promise<InsightCandidate | null>
}
