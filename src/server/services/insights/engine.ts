import { Prisma } from '@prisma/client'

import { mapWithConcurrency } from '@/lib/concurrency'
import { prisma as defaultPrisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  dispatchNotification,
  getRecipientsForModule,
} from '@/server/services/notification-service'

import { ALL_RULES } from './rules'
import type { InsightCandidate, InsightRule } from './types'

export type EngineRunResult = {
  scanned: number
  created: number
  updated: number
  resolved: number
  errors: number
}

/**
 * Roda todas as regras para uma clínica.
 * - Se a regra dispara e não existe insight aberto da mesma `ruleKey`: cria.
 * - Se a regra dispara e já existe um aberto: atualiza diagnóstico/suggestion.
 * - Se a regra NÃO dispara mas existe insight aberto: marca como RESOLVED.
 *
 * Idempotente: rodar duas vezes seguidas não duplica insights.
 */
export async function runInsightsForClinic(
  organizationId: string,
  clientId: string,
  options?: {
    now?: Date
    rules?: InsightRule[]
    prisma?: typeof defaultPrisma
    /**
     * Dispara notificação ao criar insight novo. Default: true em produção.
     * Quando `options.prisma` é injetado (caminho usado por testes unit),
     * default vira `false` para não tocar no singleton real.
     */
    notify?: boolean
  }
): Promise<EngineRunResult> {
  const rules = options?.rules ?? ALL_RULES
  const prismaClient = options?.prisma ?? defaultPrisma
  const now = options?.now ?? new Date()
  const notify = options?.notify ?? !options?.prisma

  const result: EngineRunResult = {
    scanned: rules.length,
    created: 0,
    updated: 0,
    resolved: 0,
    errors: 0,
  }

  // Carrega abertos uma vez só para evitar N round-trips.
  const openInsights = await prismaClient.insight.findMany({
    where: {
      organizationId,
      clientId,
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
    },
    select: { id: true, ruleKey: true, status: true },
  })
  const openByKey = new Map(openInsights.map((i) => [i.ruleKey, i]))
  const triggeredKeys = new Set<string>()

  for (const rule of rules) {
    try {
      const candidate = await rule.evaluate({
        organizationId,
        clientId,
        now,
        prisma: prismaClient,
      })
      if (!candidate) continue
      triggeredKeys.add(rule.key)

      const existing = openByKey.get(rule.key)
      const data = buildPersistData(candidate)

      if (existing) {
        await prismaClient.insight.update({
          where: { id: existing.id },
          data: { ...data, updatedAt: now },
        })
        result.updated++
      } else {
        const created = await prismaClient.insight.create({
          data: {
            organizationId,
            clientId,
            status: 'OPEN',
            ...data,
          },
        })
        result.created++

        if (notify) {
          // Notifica titular + staff com `insights:read` quando insight novo
          // nasce. Falha aqui não derruba o engine — só loga. Link = rota da
          // CLÍNICA (todos os destinatários são usuários de clínica).
          try {
            const recipients = await getRecipientsForModule(organizationId, clientId, 'insights')
            if (recipients.length > 0) {
              await dispatchNotification(recipients, {
                type: 'INSIGHT_GENERATED',
                title: `Novo insight: ${candidate.title}`,
                message: candidate.diagnosis,
                link: '/insights',
                metadata: { insightId: created.id, ruleKey: candidate.ruleKey },
                dedupeWindowHours: 20,
              })
            }
          } catch (notifyErr) {
            logger.warn('Insight notification dispatch failed', {
              clientId,
              ruleKey: rule.key,
              error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            })
          }
        }
      }
    } catch (err) {
      result.errors++
      logger.error('Insight rule failed', {
        clientId,
        ruleKey: rule.key,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Resolve insights abertos cujas regras não dispararam mais.
  const stillOpen = openInsights.filter(
    (i) => !triggeredKeys.has(i.ruleKey) && rules.some((r) => r.key === i.ruleKey)
  )
  if (stillOpen.length > 0) {
    await prismaClient.insight.updateMany({
      where: { id: { in: stillOpen.map((i) => i.id) } },
      data: { status: 'RESOLVED', resolvedAt: now },
    })
    result.resolved += stillOpen.length
  }

  logger.info('Insights engine run', { clientId, ...result })
  return result
}

function buildPersistData(candidate: InsightCandidate) {
  return {
    ruleKey: candidate.ruleKey,
    category: candidate.category,
    severity: candidate.severity,
    title: candidate.title,
    diagnosis: candidate.diagnosis,
    suggestion: candidate.suggestion,
    estimatedImpact:
      candidate.estimatedImpact != null ? new Prisma.Decimal(candidate.estimatedImpact) : null,
    metadata: (candidate.metadata ?? {}) as Prisma.InputJsonValue,
  }
}

export async function runInsightsForAllClinics(options?: {
  now?: Date
  prisma?: typeof defaultPrisma
}): Promise<{ totals: EngineRunResult; clinics: number }> {
  const prismaClient = options?.prisma ?? defaultPrisma
  const clients = await prismaClient.client.findMany({
    where: { deletedAt: null, status: { in: ['ACTIVE', 'ONBOARDING'] } },
    select: { id: true, organizationId: true },
  })

  const totals: EngineRunResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    resolved: 0,
    errors: 0,
  }

  // Paralelismo limitado: 5 clínicas simultâneas equilibra throughput x carga
  // no Postgres. Erros isolados por clínica não interrompem o batch.
  await mapWithConcurrency(clients, 5, async (c) => {
    try {
      const r = await runInsightsForClinic(c.organizationId, c.id, options)
      totals.scanned += r.scanned
      totals.created += r.created
      totals.updated += r.updated
      totals.resolved += r.resolved
      totals.errors += r.errors
    } catch (err) {
      totals.errors++
      logger.error('Insights engine clinic failed', {
        clientId: c.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return { totals, clinics: clients.length }
}
