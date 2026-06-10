import type { CostType, Prisma } from '@prisma/client'

import { prisma as defaultPrisma } from '@/lib/prisma'
import { clampDayToMonth, monthBoundsFor } from '@/lib/date'
import { logger } from '@/lib/logger'

export type RecurringRunResult = {
  scanned: number
  created: number
  skipped: number
  errors: number
}

type RecurringTemplate = {
  id: string
  organizationId: string
  clientId: string
  type: CostType
  category: string | null
  amount: Prisma.Decimal | number
  description: string | null
  recurringDay: number | null
  campaignId: string | null
  createdById: string | null
}

// Interface mínima do Prisma usada pelo job — permite mock em testes.
export type RecurringCostPrisma = {
  cost: {
    findMany: (args: unknown) => Promise<RecurringTemplate[]>
    findFirst: (args: unknown) => Promise<{ id: string } | null>
    create: (args: unknown) => Promise<{ id: string }>
  }
}

/**
 * Materializes Cost children for every recurring template whose `recurringDay`
 * has already arrived in the reference month. Idempotent: a child for template T
 * in month M is keyed by `recurringSourceId = T.id` and date inside that month.
 *
 * Pure-ish service: aceita `prisma` por DI para facilitar testes unitários.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}

export async function runRecurringCostsJob(
  referenceDate: Date = new Date(),
  prisma: RecurringCostPrisma = defaultPrisma as unknown as RecurringCostPrisma
): Promise<RecurringRunResult> {
  const { year, month0, day, monthStart, nextMonthStart } = monthBoundsFor(referenceDate)
  const monthKey = `${year}-${String(month0 + 1).padStart(2, '0')}`

  const templates = await prisma.cost.findMany({
    where: {
      isRecurring: true,
      recurringDay: { not: null, lte: day },
      deletedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      type: true,
      category: true,
      amount: true,
      description: true,
      recurringDay: true,
      campaignId: true,
      createdById: true,
    },
  })

  let created = 0
  let skipped = 0
  let errors = 0

  for (const t of templates) {
    if (!t.recurringDay) {
      skipped++
      continue
    }
    try {
      const existing = await prisma.cost.findFirst({
        where: {
          recurringSourceId: t.id,
          deletedAt: null,
          date: { gte: monthStart, lt: nextMonthStart },
        },
        select: { id: true },
      })

      if (existing) {
        skipped++
        continue
      }

      const date = clampDayToMonth(year, month0, t.recurringDay)
      await prisma.cost.create({
        data: {
          organizationId: t.organizationId,
          clientId: t.clientId,
          type: t.type,
          category: t.category,
          amount: t.amount,
          date,
          description: t.description ?? t.category ?? 'Custo recorrente',
          isRecurring: false,
          campaignId: t.campaignId,
          createdById: t.createdById,
          recurringSourceId: t.id,
          // Unique (recurringSourceId, recurringMonthKey) — anti-duplicação H1.
          recurringMonthKey: monthKey,
        },
      })
      created++
    } catch (err) {
      // P2002 = outra execução concorrente criou o filho deste mês entre o
      // findFirst e o create — a constraint fez o papel dela; conta como skip.
      if (isUniqueViolation(err)) {
        skipped++
        continue
      }
      errors++
      logger.error('Recurring cost generation failed', {
        templateId: t.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('Recurring costs job complete', {
    scanned: templates.length,
    created,
    skipped,
    errors,
    month: monthKey,
  })

  return { scanned: templates.length, created, skipped, errors }
}
