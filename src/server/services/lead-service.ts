import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

// winLead REMOVIDO (2026-06-10): conversão manual "Ganhou" foi extinta por
// decisão de produto — fechar card passa OBRIGATORIAMENTE pelo fluxo
// Compareceu→Fechado (moveLeadWithEffect em pipeline-stage-effects), que valida
// Appointment ATTENDED antes da baixa. Histórico no git se precisar.

export async function loseLead(
  ctx: TenantContext,
  clientId: string,
  leadId: string,
  lostStageId: string,
  reason: string
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!lead) return

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: lostStageId, clientId: lead.clientId },
    select: { id: true },
  })
  if (!stage) return

  await scopedTransaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        stageId: lostStageId,
        lostAt: new Date(),
        lostReason: reason,
        updatedById: ctx.userId,
      },
    })
    await tx.leadInteraction.create({
      data: { leadId, type: 'LOST', content: reason, createdById: ctx.userId },
    })
  })
}

export async function addInteraction(
  ctx: TenantContext,
  clientId: string,
  leadId: string,
  type: string,
  content: string
) {
  // LeadInteraction não tem clientId (não é coberto por RLS); valida a posse do
  // lead pela clínica antes de anexar a interação (belt).
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!lead) return null

  return prisma.leadInteraction.create({
    data: { leadId, type, content, createdById: ctx.userId },
  })
}
