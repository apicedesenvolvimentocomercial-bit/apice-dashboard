import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

/**
 * Conversão Lead → Patient (+ Revenue se houver estimatedValue).
 * As operações rodam numa única transação para garantir consistência:
 * se qualquer passo falhar, nada fica persistido.
 */
export async function winLead(ctx: TenantContext, leadId: string, wonStageId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!lead) return null

  // Garante que o estágio de destino pertence à mesma clínica do lead
  // (defesa contra `wonStageId` cruzado de outra clínica).
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: wonStageId, clientId: lead.clientId },
    select: { id: true },
  })
  if (!stage) return null

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: lead.clientId,
        name: lead.name,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        firstVisitAt: new Date(),
      },
    })

    await tx.lead.update({
      where: { id: leadId },
      data: {
        stageId: wonStageId,
        closedAt: new Date(),
        patientId: patient.id,
        updatedById: ctx.userId,
      },
    })

    await tx.leadInteraction.create({
      data: {
        leadId,
        type: 'WON',
        content: 'Lead convertido em paciente.',
        createdById: ctx.userId,
      },
    })

    if (lead.estimatedValue) {
      await tx.revenue.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: lead.clientId,
          patientId: patient.id,
          amount: lead.estimatedValue,
          date: new Date(),
          description: `Lead convertido: ${lead.name}${lead.procedureInterest ? ` — ${lead.procedureInterest}` : ''}`,
          createdById: ctx.userId,
        },
      })
    }

    return patient
  })
}

export async function loseLead(
  ctx: TenantContext,
  leadId: string,
  lostStageId: string,
  reason: string
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!lead) return

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: lostStageId, clientId: lead.clientId },
    select: { id: true },
  })
  if (!stage) return

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        stageId: lostStageId,
        lostAt: new Date(),
        lostReason: reason,
        updatedById: ctx.userId,
      },
    }),
    prisma.leadInteraction.create({
      data: { leadId, type: 'LOST', content: reason, createdById: ctx.userId },
    }),
  ])
}

export async function addInteraction(
  ctx: TenantContext,
  leadId: string,
  type: string,
  content: string
) {
  return prisma.leadInteraction.create({
    data: { leadId, type, content, createdById: ctx.userId },
  })
}
