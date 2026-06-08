import { prisma } from '@/lib/prisma'
import { monthBoundsFor, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'
import {
  getRetentionStageMap,
  removeActiveCommercialDuplicates,
  type RetentionStageKey,
} from '@/server/services/retention-service'
import {
  ensureDefaultMessageTemplates,
  enqueueMessage,
  RETENTION_TEMPLATE_KEYS,
} from '@/server/services/message-service'

/**
 * Cron de retenção — CICLO DE VIDA DO PACIENTE (reforma — retencao-reforma-progresso.md).
 * Cross-clínica → contexto admin (GUC nula), exceção legítima de RLS. Por clínica:
 *
 *  1. Garante a pipeline RETENTION (5 etapas nativas) + templates default.
 *  2. MIGRAÇÃO: cards no "Fechado" comercial (fechados ANTES de hoje) entram na
 *     retenção na etapa de ENTRADA (Pós-procedimento). Remove duplicatas comerciais.
 *  3. Rede de segurança: pacientes que comparecerem, sem card de retenção e sem card
 *     comercial ativo → entram na retenção.
 *  4. PROGRESSÃO: cada card de retenção é reposicionado no BUCKET calculado por tempo
 *     desde a última visita + recorrência do procedimento, e a mensagem-template do
 *     bucket é enfileirada (idempotente por dedupeKey ancorado na última visita).
 *
 * Idempotente: rodar de novo não duplica card nem mensagem.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const BUCKET_TEMPLATE: Partial<Record<RetentionStageKey, string>> = {
  POST_CARE: RETENTION_TEMPLATE_KEYS.POST_CARE,
  NURTURE: RETENTION_TEMPLATE_KEYS.NURTURE,
  REACTIVATION: RETENTION_TEMPLATE_KEYS.REACTIVATION,
  WINBACK: RETENTION_TEMPLATE_KEYS.WINBACK,
  // LOYALTY: sem mensagem — paciente recorrente comprometido (não precisa de cutucão).
}

export type BucketInput = {
  now: Date
  lastVisitAt: Date | null
  /** Janela recomendada de retorno (recurrenceDays do procedimento ou fallback). */
  returnWindowDays: number
  hasFutureAppt: boolean
  isRecurrent: boolean
  winbackDays: number
}

/** Decide o bucket de retenção (função pura — testável). Ver regras no ledger. */
export function computeRetentionBucket(input: BucketInput): RetentionStageKey {
  const { now, lastVisitAt, returnWindowDays, hasFutureAppt, isRecurrent, winbackDays } = input
  if (!lastVisitAt) return 'NURTURE' // card sem visita registrada → estado neutro

  const daysSince = Math.floor((now.getTime() - lastVisitAt.getTime()) / DAY_MS)
  if (daysSince <= 1) return 'POST_CARE'
  if (hasFutureAppt && isRecurrent) return 'LOYALTY' // recorrente com retorno marcado
  if (daysSince <= 15) return 'NURTURE'
  if (daysSince <= returnWindowDays) return 'NURTURE' // ainda dentro da janela de retorno
  if (daysSince <= winbackDays) return 'REACTIVATION' // janela venceu, não remarcou
  return 'WINBACK' // inativo longo
}

export async function runRetentionJob() {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { not: 'INACTIVE' } },
    select: {
      id: true,
      name: true,
      organizationId: true,
      inactivityDays: true,
      winbackDays: true,
    },
  })

  // Fronteira "hoje" no fuso de SP: fechados antes disso migram (= dia seguinte).
  const now = new Date()
  const b = monthBoundsFor(now)
  const startOfTodaySP = spDate(b.year, b.month0, b.day, 0, 0, 0)

  let migrated = 0
  let activated = 0
  let moved = 0
  let queued = 0

  for (const client of clients) {
    await ensureNativePipelines(client.id, client.organizationId)
    await ensureDefaultMessageTemplates(client.id, client.organizationId)

    const stageMap = await getRetentionStageMap(client.id)
    const entryStageId = stageMap.POST_CARE ?? stageMap.NURTURE
    if (!entryStageId) continue

    // (2) Migração: Fechado (fechado antes de hoje) → entrada da retenção.
    const commercial = await prisma.pipeline.findFirst({
      where: { clientId: client.id, kind: 'COMMERCIAL' },
      select: { stages: { select: { id: true, nativeKey: true } } },
    })
    const closedStageId = commercial?.stages.find((s) => s.nativeKey === 'CLOSED')?.id
    if (closedStageId) {
      const closedLeads = await prisma.lead.findMany({
        where: {
          clientId: client.id,
          organizationId: client.organizationId,
          deletedAt: null,
          stageId: closedStageId,
          closedAt: { lt: startOfTodaySP },
        },
        select: { id: true, name: true, phone: true, email: true, patientId: true },
      })
      for (const lead of closedLeads) {
        await removeActiveCommercialDuplicates(client.id, client.organizationId, lead, lead.id)
        await prisma.lead.update({ where: { id: lead.id }, data: { stageId: entryStageId } })
        migrated++
      }
    }

    // (3) Rede de segurança: pacientes ATTENDED sem card de retenção e sem card
    // comercial ativo → entra na retenção.
    const completedPatients = await prisma.patient.findMany({
      where: {
        clientId: client.id,
        organizationId: client.organizationId,
        deletedAt: null,
        appointments: { some: { status: 'ATTENDED', deletedAt: null } },
        leads: {
          none: {
            deletedAt: null,
            OR: [
              { stage: { pipeline: { kind: 'RETENTION' } } },
              { stage: { pipeline: { kind: 'COMMERCIAL' }, isWon: false, isLost: false } },
            ],
          },
        },
      },
      select: { id: true, name: true, phone: true, email: true },
    })
    for (const p of completedPatients) {
      await prisma.lead.create({
        data: {
          organizationId: client.organizationId,
          clientId: client.id,
          name: p.name,
          phone: p.phone,
          email: p.email,
          source: 'WALK_IN',
          stageId: entryStageId,
          patientId: p.id,
        },
      })
      activated++
    }

    // (4) Progressão: reposiciona cada card no bucket calculado + enfileira mensagem.
    const cards = await prisma.lead.findMany({
      where: {
        clientId: client.id,
        deletedAt: null,
        patientId: { not: null },
        stage: { pipeline: { kind: 'RETENTION' } },
      },
      select: { id: true, stageId: true, patientId: true, name: true, phone: true },
    })

    for (const card of cards) {
      const patientId = card.patientId
      if (!patientId) continue

      const [lastVisit, futureAppt, attendedCount, patientRow] = await Promise.all([
        prisma.appointment.findFirst({
          where: { patientId, clientId: client.id, status: 'ATTENDED', deletedAt: null },
          orderBy: { attendedAt: 'desc' },
          select: { attendedAt: true, procedure: { select: { name: true, recurrenceDays: true } } },
        }),
        prisma.appointment.findFirst({
          where: {
            patientId,
            clientId: client.id,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            scheduledAt: { gt: now },
            deletedAt: null,
          },
          select: { id: true },
        }),
        prisma.appointment.count({
          where: { patientId, clientId: client.id, status: 'ATTENDED', deletedAt: null },
        }),
        prisma.patient.findUnique({ where: { id: patientId }, select: { nextReturnDueAt: true } }),
      ])

      const lastVisitAt = lastVisit?.attendedAt ?? null
      const returnWindowDays = lastVisit?.procedure?.recurrenceDays ?? client.inactivityDays
      const bucket = computeRetentionBucket({
        now,
        lastVisitAt,
        returnWindowDays,
        hasFutureAppt: !!futureAppt,
        isRecurrent: attendedCount >= 2,
        winbackDays: client.winbackDays,
      })

      // Denorm do retorno esperado (UI): última visita + janela. Só escreve se mudou.
      const nextReturnDueAt = lastVisitAt
        ? new Date(lastVisitAt.getTime() + returnWindowDays * DAY_MS)
        : null
      if (nextReturnDueAt?.getTime() !== (patientRow?.nextReturnDueAt?.getTime() ?? undefined)) {
        await prisma.patient.update({ where: { id: patientId }, data: { nextReturnDueAt } })
      }

      const targetStageId = stageMap[bucket]
      if (targetStageId && targetStageId !== card.stageId) {
        await prisma.lead.update({ where: { id: card.id }, data: { stageId: targetStageId } })
        moved++
      }

      // Enfileira a mensagem do bucket (idempotente por dedupeKey ancorado na última
      // visita — 1 mensagem por bucket por ciclo de visita; LOYALTY não cutuca).
      const templateKey = BUCKET_TEMPLATE[bucket]
      if (templateKey) {
        const anchor = lastVisitAt ? lastVisitAt.toISOString().slice(0, 10) : 'none'
        await enqueueMessage({
          organizationId: client.organizationId,
          clientId: client.id,
          patientId,
          templateKey,
          to: card.phone,
          vars: {
            nome: card.name.split(' ')[0] ?? card.name,
            procedimento: lastVisit?.procedure?.name ?? 'procedimento',
            clinica: client.name,
          },
          dedupeKey: `ret:${patientId}:${bucket}:${anchor}`,
        })
        queued++
      }
    }
  }

  logger.info('Retention job finished', {
    clients: clients.length,
    migrated,
    activated,
    moved,
    queued,
  })
  return { clients: clients.length, migrated, activated, moved, queued }
}
