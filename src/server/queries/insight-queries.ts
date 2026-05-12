import type { InsightCategory, InsightSeverity, InsightStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'

export type InsightRow = Awaited<ReturnType<typeof listInsights>>[number]

export async function listInsights(
  clientId: string,
  filters?: {
    status?: InsightStatus[]
    severity?: InsightSeverity[]
    category?: InsightCategory[]
  }
): Promise<
  {
    id: string
    ruleKey: string
    category: InsightCategory
    severity: InsightSeverity
    status: InsightStatus
    title: string
    diagnosis: string
    suggestion: string
    estimatedImpact: number | null
    createdAt: Date
    updatedAt: Date
    acknowledgedAt: Date | null
    resolvedAt: Date | null
    dismissedAt: Date | null
    dismissReason: string | null
  }[]
> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)

  const rows = await prisma.insight.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      ...(filters?.status && filters.status.length > 0 ? { status: { in: filters.status } } : {}),
      ...(filters?.severity && filters.severity.length > 0
        ? { severity: { in: filters.severity } }
        : {}),
      ...(filters?.category && filters.category.length > 0
        ? { category: { in: filters.category } }
        : {}),
    },
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })

  return rows.map((r) => ({
    ...r,
    estimatedImpact: r.estimatedImpact != null ? Number(r.estimatedImpact) : null,
  }))
}

export async function getInsightCountsByClinic(): Promise<
  Map<string, { open: number; critical: number }>
> {
  const ctx = await getTenantContext()
  const rows = await prisma.insight.groupBy({
    by: ['clientId', 'status', 'severity'],
    where: {
      organizationId: ctx.organizationId,
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
    },
    _count: { _all: true },
  })

  const map = new Map<string, { open: number; critical: number }>()
  for (const r of rows) {
    const cur = map.get(r.clientId) ?? { open: 0, critical: 0 }
    cur.open += r._count._all
    if (r.severity === 'CRITICAL') cur.critical += r._count._all
    map.set(r.clientId, cur)
  }
  return map
}
