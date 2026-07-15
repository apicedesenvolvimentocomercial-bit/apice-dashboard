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
import { NotFoundError, runAction } from '@/types/errors'

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
    return listReceivables(ctx, clientId, undefined, cursor ? { cursor } : undefined)
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
    const paidAt = paidAtISO ? new Date(paidAtISO) : new Date()
    const res = await markReceivablePaid(ctx, clientId, receivableId, paidAt)
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
    const res = await markReceivableLost(ctx, clientId, receivableId)
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
    const res = await markReceivablePending(ctx, clientId, receivableId)
    if (res.count === 0) throw new NotFoundError('Parcela')
    revalidate(clientId)
    return null
  })
}
