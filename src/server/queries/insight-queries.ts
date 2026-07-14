import type { InsightCategory, InsightSeverity, InsightStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertCan } from '@/server/auth/assert-can'
import { runInsightsForClinic } from '@/server/services/insights/engine'

export type InsightRow = Awaited<ReturnType<typeof listInsights>>[number]

/**
 * Janela do gate de frescor do recálculo automático. O marcador é o
 * `max(updatedAt)` dos insights da clínica: qualquer escrita (engine OU ação
 * de status como Reconhecer/Dispensar) o renova.
 */
const FRESHNESS_WINDOW_MS = 10 * 60 * 1000

/**
 * Lista os insights RECALCULANDO antes (carregamento automático ao abrir a página),
 * atrás de um GATE DE FRESCOR: o engine só reroda se a última mexida nos insights
 * da clínica tiver mais de 10 min. Sem o gate, cada ação de status pagava o engine
 * inteiro de novo na revalidação (era o gargalo de latência das ações). O botão
 * "Recalcular" (`recalculateInsightsAction`) chama o engine direto, SEM gate.
 * Clínica sem nenhum insight roda sempre (não há marcador de última análise).
 *
 * O recálculo é best-effort: uma regra que falhe não quebra a tela, e roda com
 * `notify:false` — só a ação explícita "Recalcular"/cron dispara notificação, para
 * que uma simples visita não gere alertas. Gate `insights:read` + escopo via
 * `listInsights`. Idempotente: o engine cria/resolve sem duplicar.
 */
export async function listInsightsFresh(
  clientId: string,
  filters?: {
    status?: InsightStatus[]
    severity?: InsightSeverity[]
    category?: InsightCategory[]
  }
): Promise<Awaited<ReturnType<typeof listInsights>>> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'insights', 'read')

  const last = await prisma.insight.aggregate({
    where: { organizationId: ctx.organizationId, clientId },
    _max: { updatedAt: true },
  })
  const lastTouch = last._max.updatedAt
  const isFresh = lastTouch != null && Date.now() - lastTouch.getTime() < FRESHNESS_WINDOW_MS
  if (!isFresh) {
    await runInsightsForClinic(ctx.organizationId, clientId, { notify: false }).catch(() => {})
  }
  return listInsights(clientId, filters)
}

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
    // JSON livre da regra; a UI extrai `metadata.metric` ({value,label}) p/ o
    // destaque do card (redesign) com fallback em estimatedImpact.
    metadata: unknown
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
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'insights', 'read')

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
  // Agregado org-wide (visão da agência sobre todas as clínicas) — gate admin/STAFF.
  await assertCan(ctx, 'clients', 'read')
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
