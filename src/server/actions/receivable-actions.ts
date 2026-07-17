'use server'

import { revalidatePath } from 'next/cache'

import { assertCan } from '@/server/auth/assert-can'
import {
  listReceivables,
  markReceivableLost,
  markReceivablePaid,
  markReceivablePending,
  summarizeReceivables,
} from '@/server/repositories/receivable-repository'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { NotFoundError, runAction, ValidationError } from '@/types/errors'
import { z } from 'zod'

const idSchema = z.string().min(1).max(64)
// Data ISO vinda do date-picker de baixa; refine barra "Invalid Date" antes do Prisma.
const paidAtSchema = z
  .string()
  .max(40, 'Data inválida')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Data inválida')

function parseWith<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ValidationError(label)
  return parsed.data
}

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath(`/clients/${clientId}/financial`)
}

export async function listReceivablesAction(clientId: string, cursor?: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'read')
    const parsedCursor = cursor ? parseWith(idSchema, cursor, 'Cursor inválido') : undefined
    return listReceivables(
      ctx,
      clientId,
      undefined,
      parsedCursor ? { cursor: parsedCursor } : undefined
    )
  })
}

export async function getReceivablesSummaryAction(clientId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'read')
    return summarizeReceivables(ctx, clientId)
  })
}

export async function markReceivablePaidAction(
  clientId: string,
  receivableId: string,
  paidAtISO?: string
) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'write')
    const id = parseWith(idSchema, receivableId, 'Parcela inválida')
    const paidAt = paidAtISO
      ? new Date(parseWith(paidAtSchema, paidAtISO, 'Data inválida'))
      : new Date()
    const res = await markReceivablePaid(ctx, clientId, id, paidAt)
    if (res.count === 0) throw new NotFoundError('Parcela')
    revalidate(clientId)
    return null
  })
}

export async function markReceivableLostAction(clientId: string, receivableId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'write')
    const res = await markReceivableLost(
      ctx,
      clientId,
      parseWith(idSchema, receivableId, 'Parcela inválida')
    )
    if (res.count === 0) throw new NotFoundError('Parcela')
    revalidate(clientId)
    return null
  })
}

export async function markReceivablePendingAction(clientId: string, receivableId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'write')
    const res = await markReceivablePending(
      ctx,
      clientId,
      parseWith(idSchema, receivableId, 'Parcela inválida')
    )
    if (res.count === 0) throw new NotFoundError('Parcela')
    revalidate(clientId)
    return null
  })
}
