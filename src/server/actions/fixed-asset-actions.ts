'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseLocalDate } from '@/lib/date'
import { assertCan } from '@/server/auth/assert-can'
import {
  createFixedAsset,
  disposeFixedAsset,
  listFixedAssets,
  softDeleteFixedAsset,
} from '@/server/repositories/fixed-asset-repository'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { fail, NotFoundError, ok, runAction } from '@/types/errors'

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
  category: z.string().trim().max(80).optional(),
  kind: z.enum(['TANGIVEL', 'INTANGIVEL']),
  acquisitionValue: z.number().positive('Valor deve ser positivo'),
  residualValue: z.number().min(0).optional(),
  acquisitionDate: z.string().min(1, 'Data obrigatória'),
  usefulLifeMonths: z.number().int().positive('Vida útil em meses'),
})

function revalidate(clientId: string) {
  revalidatePath('/financial')
  revalidatePath(`/clients/${clientId}/financial`)
}

export async function listFixedAssetsAction(clientId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'read')
    return listFixedAssets(ctx, clientId)
  })
}

export async function createFixedAssetAction(clientId: string, input: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'write')

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos')
  const date = parseLocalDate(parsed.data.acquisitionDate)
  if (!date) return fail('Data inválida')
  if (parsed.data.residualValue && parsed.data.residualValue >= parsed.data.acquisitionValue) {
    return fail('Valor residual deve ser menor que o de aquisição')
  }

  await createFixedAsset(ctx, clientId, {
    name: parsed.data.name,
    category: parsed.data.category || undefined,
    kind: parsed.data.kind,
    acquisitionValue: parsed.data.acquisitionValue,
    residualValue: parsed.data.residualValue,
    acquisitionDate: date,
    usefulLifeMonths: parsed.data.usefulLifeMonths,
  })
  revalidate(clientId)
  return ok(null)
}

export async function disposeFixedAssetAction(clientId: string, assetId: string, dateISO?: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'write')
    const disposedAt = dateISO ? (parseLocalDate(dateISO) ?? new Date()) : new Date()
    const res = await disposeFixedAsset(ctx, clientId, assetId, disposedAt)
    if (res.count === 0) throw new NotFoundError('Ativo')
    revalidate(clientId)
    return null
  })
}

export async function deleteFixedAssetAction(clientId: string, assetId: string) {
  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'delete')
    const res = await softDeleteFixedAsset(ctx, clientId, assetId)
    if (res.count === 0) throw new NotFoundError('Ativo')
    revalidate(clientId)
    return null
  })
}
