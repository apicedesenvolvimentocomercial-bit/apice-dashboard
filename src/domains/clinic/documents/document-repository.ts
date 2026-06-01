import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Repositório de Documentos do card do cliente (item 6c). Só METADADOS — o
 * binário vive no bucket privado do Supabase. `clientId` FORÇADO (belt) + RLS.
 */

export async function listClinicDocumentsForTarget(
  ctx: ClinicContext,
  target: { leadId?: string; patientId?: string; leadIds?: string[] }
) {
  const or: Prisma.DocumentWhereInput[] = []
  if (target.leadId) or.push({ leadId: target.leadId })
  if (target.patientId) or.push({ patientId: target.patientId })
  if (target.leadIds?.length) or.push({ leadId: { in: target.leadIds } })
  if (or.length === 0) return []

  return prisma.document.findMany({
    where: { clientId: ctx.clientId, deletedAt: null, OR: or },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { uploader: { select: { id: true, name: true } } },
  })
}

export async function createClinicDocument(
  ctx: ClinicContext,
  data: {
    leadId?: string | null
    patientId?: string | null
    fileName: string
    mimeType: string
    sizeBytes: number
    storagePath: string
  }
) {
  return prisma.document.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, // FORÇADO.
      leadId: data.leadId ?? null,
      patientId: data.patientId ?? null,
      uploaderId: ctx.userId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storagePath: data.storagePath,
    },
  })
}

export async function findClinicDocumentById(ctx: ClinicContext, docId: string) {
  return prisma.document.findFirst({
    where: { id: docId, clientId: ctx.clientId, deletedAt: null },
  })
}

export async function softDeleteClinicDocument(ctx: ClinicContext, docId: string) {
  return prisma.document.updateMany({
    where: { id: docId, clientId: ctx.clientId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
