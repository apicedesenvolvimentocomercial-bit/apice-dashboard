'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { NotFoundError, fail, runAction } from '@/types/errors'
import { runInsightsForClinic } from '@/server/services/insights/engine'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'

function revalidate(clientId: string) {
  revalidatePath('/overview')
  revalidatePath('/insights')
  revalidatePath(`/clients/${clientId}/overview`)
  revalidatePath(`/clients/${clientId}/insights`)
}

async function loadInsight(insightId: string) {
  const ctx = await getTenantContext()
  const insight = await prisma.insight.findFirst({
    where: { id: insightId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  })
  if (!insight) throw new NotFoundError('Insight')
  await assertClientAccess(ctx, insight.clientId)
  enterClientScope(insight.clientId) // suspenders: RLS p/ os updates por-id seguintes
  await assertCan(ctx, 'insights', 'write')
  return { ctx, insight }
}

export async function acknowledgeInsightAction(insightId: string) {
  return runAction(async () => {
    const { insight } = await loadInsight(insightId)
    await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    })
    revalidate(insight.clientId)
    return null
  })
}

export async function startInsightAction(insightId: string) {
  return runAction(async () => {
    const { insight } = await loadInsight(insightId)
    await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'IN_PROGRESS' },
    })
    revalidate(insight.clientId)
    return null
  })
}

export async function resolveInsightAction(insightId: string) {
  return runAction(async () => {
    const { insight } = await loadInsight(insightId)
    await prisma.insight.update({
      where: { id: insightId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    })
    revalidate(insight.clientId)
    return null
  })
}

const dismissSchema = z.object({ reason: z.string().min(3, 'Motivo é obrigatório') })

export async function dismissInsightAction(insightId: string, formData: unknown) {
  const parsed = dismissSchema.safeParse(formData)
  if (!parsed.success) return fail('Motivo obrigatório')

  return runAction(async () => {
    const { insight } = await loadInsight(insightId)
    await prisma.insight.update({
      where: { id: insightId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissReason: parsed.data.reason,
      },
    })
    revalidate(insight.clientId)
    return null
  })
}

export async function recalculateInsightsAction(clientId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'insights', 'write')
    const result = await runInsightsForClinic(ctx.organizationId, clientId)
    revalidate(clientId)
    return result
  })
}
