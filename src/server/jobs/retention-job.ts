import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ensureNativePipelines } from '@/server/repositories/pipeline-repository'

/**
 * Cron de retenção (Fase 2e). Cross-clínica → roda em contexto admin (GUC nula),
 * exceção legítima de RLS (ver rls-gambiarra §entrypoints). Para cada clínica:
 *
 *  1. Garante a pipeline RETENTION + suas etapas nativas (ACTIVE/INACTIVE).
 *  2. "Ativo puxa todos os pacientes": cria um card em ACTIVE para todo paciente
 *     sem card na pipeline RETENTION.
 *  3. Inatividade: move para INACTIVE os cards em ACTIVE cujo paciente não teve
 *     Appointment ATTENDED nem Revenue nos últimos `Client.inactivityDays` dias.
 *
 * Idempotente: rodar de novo não duplica cards nem re-move quem já está em INACTIVE.
 */
export async function runRetentionJob() {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { not: 'INACTIVE' } },
    select: { id: true, organizationId: true, inactivityDays: true },
  })

  let activated = 0
  let deactivated = 0

  for (const client of clients) {
    await ensureNativePipelines(client.id, client.organizationId)

    const retention = await prisma.pipeline.findFirst({
      where: { clientId: client.id, kind: 'RETENTION' },
      select: {
        id: true,
        stages: { select: { id: true, nativeKey: true } },
      },
    })
    if (!retention) continue

    const activeStage = retention.stages.find((s) => s.nativeKey === 'ACTIVE')
    const inactiveStage = retention.stages.find((s) => s.nativeKey === 'INACTIVE')
    if (!activeStage || !inactiveStage) continue

    // (2) Pacientes sem card na pipeline RETENTION → cria em ACTIVE.
    const patientsWithoutCard = await prisma.patient.findMany({
      where: {
        clientId: client.id,
        organizationId: client.organizationId,
        deletedAt: null,
        leads: { none: { deletedAt: null, stage: { pipelineId: retention.id } } },
      },
      select: { id: true, name: true, phone: true, email: true },
    })
    for (const p of patientsWithoutCard) {
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
    activated,
    deactivated,
  })
  return { clients: clients.length, activated, deactivated }
}
