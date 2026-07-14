import type { InsightCategory, InsightSeverity } from '@prisma/client'

import type { prisma as defaultPrisma } from '@/lib/prisma'

export type PrismaLike = typeof defaultPrisma

export type RuleInput = {
  organizationId: string
  clientId: string
  now: Date
  // Injetado pelo engine — permite mockar em testes sem tocar no DB real.
  prisma: PrismaLike
}

/**
 * Métrica de destaque do card de insight (redesign): valor curto ("41%",
 * "R$ 21k") + rótulo ("horários vagos"). Vive dentro de `metadata.metric` —
 * a UI cai em `estimatedImpact` quando ausente (insights antigos no banco).
 */
export type InsightMetric = { value: string; label: string }

export type InsightCandidate = {
  ruleKey: string
  category: InsightCategory
  severity: InsightSeverity
  title: string
  diagnosis: string
  estimatedImpact?: number | null
  suggestion: string
  metadata?: Record<string, unknown> & { metric?: InsightMetric }
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
