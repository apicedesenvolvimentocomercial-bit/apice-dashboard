import type { AssetKind } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type FixedAssetRow = Awaited<ReturnType<typeof listFixedAssets>>[number]

export async function listFixedAssets(ctx: TenantContext, clientId: string) {
  const rows = await prisma.fixedAsset.findMany({
    where: { organizationId: ctx.organizationId, clientId, deletedAt: null },
    orderBy: [{ disposedAt: 'asc' }, { acquisitionDate: 'desc' }],
    select: {
      id: true,
      name: true,
      category: true,
      kind: true,
      acquisitionValue: true,
      residualValue: true,
      acquisitionDate: true,
      usefulLifeMonths: true,
      disposedAt: true,
    },
  })
  return rows.map((a) => {
    const acquisitionValue = Number(a.acquisitionValue)
    const residualValue = Number(a.residualValue)
    const monthly =
      a.usefulLifeMonths > 0 ? (acquisitionValue - residualValue) / a.usefulLifeMonths : 0
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      kind: a.kind,
      acquisitionValue,
      residualValue,
      acquisitionDate: a.acquisitionDate,
      usefulLifeMonths: a.usefulLifeMonths,
      disposedAt: a.disposedAt,
      monthlyDepreciation: Math.round(monthly * 100) / 100,
    }
  })
}

export async function createFixedAsset(
  ctx: TenantContext,
  clientId: string,
  data: {
    name: string
    category?: string
    kind: AssetKind
    acquisitionValue: number
    residualValue?: number
    acquisitionDate: Date
    usefulLifeMonths: number
  }
) {
  return prisma.fixedAsset.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: data.name,
      category: data.category,
      kind: data.kind,
      acquisitionValue: data.acquisitionValue,
      residualValue: data.residualValue ?? 0,
      acquisitionDate: data.acquisitionDate,
      usefulLifeMonths: data.usefulLifeMonths,
      createdById: ctx.userId,
    },
    select: { id: true },
  })
}

// Belt: clientId no where isola entre clínicas da mesma org.
export function disposeFixedAsset(
  ctx: TenantContext,
  clientId: string,
  assetId: string,
  disposedAt: Date
) {
  return prisma.fixedAsset.updateMany({
    where: { id: assetId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { disposedAt },
  })
}

export function softDeleteFixedAsset(ctx: TenantContext, clientId: string, assetId: string) {
  return prisma.fixedAsset.updateMany({
    where: { id: assetId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
