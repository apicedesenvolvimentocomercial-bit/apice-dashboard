'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { createAuditLog } from '@/server/repositories/audit-repository'
import {
  createPipelineDeal,
  moveStage,
  softDeletePipelineDeal,
  updatePipelineDeal,
} from '@/server/repositories/pipeline-deal-repository'
import { getTenantContext } from '@/server/tenant/context'
import { ConflictError, NotFoundError, runAction } from '@/types/errors'

const STAGE_VALUES = [
  'PROSPECT',
  'CONTACTED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const

const createSchema = z.object({
  clientId: z.string().cuid(),
  stage: z.enum(STAGE_VALUES).optional(),
  value: z.coerce.number().nonnegative().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().optional(),
  notes: z.string().optional(),
})

export async function createPipelineDealAction(input: z.infer<typeof createSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'clients', 'write')

    const parsed = createSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const client = await prisma.client.findFirst({
      where: {
        id: parsed.data.clientId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!client) throw new NotFoundError('Clínica')

    const existing = await prisma.pipelineDeal.findFirst({
      where: { clientId: parsed.data.clientId, deletedAt: null },
    })
    if (existing) throw new ConflictError('Esta clínica já está no pipeline')

    const deal = await createPipelineDeal(ctx, {
      ...parsed.data,
      expectedCloseAt: parsed.data.expectedCloseAt
        ? new Date(parsed.data.expectedCloseAt)
        : undefined,
    })

    createAuditLog(ctx, {
      action: 'create',
      entityType: 'PipelineDeal',
      entityId: deal.id,
      changes: { clientId: deal.clientId, stage: deal.stage },
    }).catch(() => {})

    revalidatePath('/pipeline')
    return { id: deal.id }
  })
}

const moveSchema = z.object({
  dealId: z.string().cuid(),
  stage: z.enum(STAGE_VALUES),
  lostReason: z.string().optional(),
})

export async function moveDealStageAction(input: z.infer<typeof moveSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'clients', 'write')

    const parsed = moveSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const deal = await prisma.pipelineDeal.findFirst({
      where: {
        id: parsed.data.dealId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      select: { id: true, clientId: true, stage: true },
    })
    if (!deal) throw new NotFoundError('Negociação')

    await moveStage(ctx, parsed.data.dealId, parsed.data.stage, {
      lostReason: parsed.data.lostReason,
    })

    if (parsed.data.stage === 'WON') {
      await prisma.client.updateMany({
        where: {
          id: deal.clientId,
          organizationId: ctx.organizationId,
          deletedAt: null,
        },
        data: { status: 'ACTIVE' },
      })
    }

    createAuditLog(ctx, {
      action: 'stage_change',
      entityType: 'PipelineDeal',
      entityId: parsed.data.dealId,
      changes: { from: deal.stage, to: parsed.data.stage },
    }).catch(() => {})

    revalidatePath('/pipeline')
    return null
  })
}

const updateSchema = z.object({
  dealId: z.string().cuid(),
  value: z.coerce.number().nonnegative().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().optional(),
  notes: z.string().optional(),
})

export async function updatePipelineDealAction(input: z.infer<typeof updateSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'clients', 'write')

    const parsed = updateSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const { dealId, expectedCloseAt, ...rest } = parsed.data
    const result = await updatePipelineDeal(ctx, dealId, {
      ...rest,
      expectedCloseAt: expectedCloseAt ? new Date(expectedCloseAt) : null,
    })
    if (result.count === 0) throw new NotFoundError('Negociação')

    revalidatePath('/pipeline')
    return null
  })
}

const deleteSchema = z.object({ dealId: z.string().cuid() })

export async function deletePipelineDealAction(input: z.infer<typeof deleteSchema>) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertCan(ctx, 'clients', 'delete')

    const parsed = deleteSchema.safeParse(input)
    if (!parsed.success) throw new ConflictError(parsed.error.errors[0].message)

    const result = await softDeletePipelineDeal(ctx, parsed.data.dealId)
    if (result.count === 0) throw new NotFoundError('Negociação')

    createAuditLog(ctx, {
      action: 'delete',
      entityType: 'PipelineDeal',
      entityId: parsed.data.dealId,
    }).catch(() => {})

    revalidatePath('/pipeline')
    return null
  })
}
