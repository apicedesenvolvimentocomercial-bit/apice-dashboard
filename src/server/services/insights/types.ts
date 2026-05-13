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
