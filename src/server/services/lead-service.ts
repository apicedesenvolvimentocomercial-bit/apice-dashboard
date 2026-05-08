import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export async function winLead(ctx: TenantContext, leadId: string, wonStageId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!lead) return null

  const patient = await prisma.patient.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: lead.clientId,
      name: lead.name,
      phone: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      firstVisitAt: new Date(),
    },
  })

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      stageId: wonStageId,
      closedAt: new Date(),
      patientId: patient.id,
      updatedById: ctx.userId,
    },
  })

  await prisma.leadInteraction.create({
    data: {
      leadId,
      type: 'WON',
      content: 'Lead convertido em paciente.',
      createdById: ctx.userId,
    },
  })

  if (lead.estimatedValue) {
    await prisma.revenue.create({
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

  await prisma.lead.update({
    where: { id: leadId },
    data: { stageId: lostStageId, lostAt: new Date(), lostReason: reason, updatedById: ctx.userId },
  })

  await prisma.leadInteraction.create({
    data: { leadId, type: 'LOST', content: reason, createdById: ctx.userId },
  })
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
