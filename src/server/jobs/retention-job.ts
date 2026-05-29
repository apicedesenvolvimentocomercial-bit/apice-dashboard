import { prisma } from '@/lib/prisma'
import { monthBoundsFor, spDate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'
import { removeActiveCommercialDuplicates } from '@/server/services/retention-service'

/**
 * Cron de retenção (Fase 2e + itens 6/7). Cross-clínica → roda em contexto admin
 * (GUC nula), exceção legítima de RLS (ver rls-gambiarra §entrypoints). Por clínica:
 *
 *  1. Garante a pipeline RETENTION + etapas nativas (ACTIVE/INACTIVE).
 *  2a. MIGRAÇÃO (item 7): cards no "Fechado" comercial fechados ANTES de hoje
 *      migram para Retenção/Ativo (o MESMO card move; sai do comercial). Remove
 *      cards comerciais ativos duplicados do mesmo cliente.
 *  2b. Rede de segurança: pacientes que comparecerem (≥1 Appointment ATTENDED),
 *      sem card de retenção e sem card comercial ativo → cria card em ACTIVE.
 *  3. Inatividade: ACTIVE → INACTIVE para quem não teve atividade na janela.
 *
 * `closedAt` permanece no card migrado (conversão lê por closedAt, não por etapa).
 * Idempotente: rodar de novo não duplica nem re-migra.
 */
export async function runRetentionJob() {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { not: 'INACTIVE' } },
    select: { id: true, organizationId: true, inactivityDays: true },
  })

  // Fronteira "hoje" no fuso de SP: fechados antes disso migram (= dia seguinte).
  const b = monthBoundsFor(new Date())
  const startOfTodaySP = spDate(b.year, b.month0, b.day, 0, 0, 0)

  let migrated = 0
  let activated = 0
  let deactivated = 0

  for (const client of clients) {
    await ensureNativePipelines(client.id, client.organizationId)

    const retention = await prisma.pipeline.findFirst({
      where: { clientId: client.id, kind: 'RETENTION' },
      select: { stages: { select: { id: true, nativeKey: true } } },
    })
    if (!retention) continue
    const activeStage = retention.stages.find((s) => s.nativeKey === 'ACTIVE')
    const inactiveStage = retention.stages.find((s) => s.nativeKey === 'INACTIVE')
    if (!activeStage || !inactiveStage) continue

    // (2a) Migração: Fechado (fechado antes de hoje) → Retenção/Ativo.
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
        // Remove outros cards comerciais ativos do mesmo cliente (dedup).
        await removeActiveCommercialDuplicates(client.id, client.organizationId, lead, lead.id)
        // Move o próprio card p/ retenção (mantém closedAt/patientId).
        await prisma.lead.update({
          where: { id: lead.id },
          data: { stageId: activeStage.id },
        })
        migrated++
      }
    }

    // (2b) Rede de segurança: pacientes que comparecerem, sem card de retenção e
    // sem card comercial ativo → entra em Ativo. (Exclui fantasmas de no-show.)
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
          stageId: activeStage.id,
          patientId: p.id,
        },
      })
      activated++
    }

    // (3) Inatividade: cards em ACTIVE com paciente sem atividade na janela.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - client.inactivityDays)

    const activeCards = await prisma.lead.findMany({
      where: {
        clientId: client.id,
        stageId: activeStage.id,
        deletedAt: null,
        patientId: { not: null },
      },
      select: { id: true, patientId: true },
    })

    for (const card of activeCards) {
      if (!card.patientId) continue
      const recentAppt = await prisma.appointment.findFirst({
        where: {
          patientId: card.patientId,
          clientId: client.id,
          deletedAt: null,
          status: 'ATTENDED',
          attendedAt: { gte: cutoff },
        },
        select: { id: true },
      })
      if (recentAppt) continue

      const recentRevenue = await prisma.revenue.findFirst({
        where: {
          patientId: card.patientId,
          clientId: client.id,
          deletedAt: null,
          date: { gte: cutoff },
        },
        select: { id: true },
      })
      if (recentRevenue) continue

      // Sem atividade na janela → INACTIVE.
      await prisma.lead.update({
        where: { id: card.id },
        data: { stageId: inactiveStage.id },
      })
      deactivated++
    }
  }

  logger.info('Retention job finished', {
    clients: clients.length,
    migrated,
    activated,
    deactivated,
  })
  return { clients: clients.length, migrated, activated, deactivated }
}
