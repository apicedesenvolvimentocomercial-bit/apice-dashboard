import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { ClinicContext } from '@/server/auth/clinic-context'

/**
 * Repositório de Anotações do card do cliente (item 6). Mesma disciplina das
 * atividades: `clientId` FORÇADO da sessão (belt) + RLS sob escopo de clínica
 * (suspenders). Orientada a lead/paciente.
 */

export type ClinicNoteRow = Awaited<ReturnType<typeof listClinicNotesForTarget>>[number]

export async function listClinicNotesForTarget(
  ctx: ClinicContext,
  target: { leadId?: string; patientId?: string; leadIds?: string[] }
) {
  const or: Prisma.ClientNoteWhereInput[] = []
  if (target.leadId) or.push({ leadId: target.leadId })
  if (target.patientId) or.push({ patientId: target.patientId })
  if (target.leadIds?.length) or.push({ leadId: { in: target.leadIds } })
  if (or.length === 0) return []

  return prisma.clientNote.findMany({
    where: { clientId: ctx.clientId, deletedAt: null, OR: or },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { author: { select: { id: true, name: true } } },
  })
}

export async function createClinicNote(
  ctx: ClinicContext,
  data: { content: string; leadId?: string | null; patientId?: string | null }
) {
  return prisma.clientNote.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: ctx.clientId, // FORÇADO.
      leadId: data.leadId ?? null,
      patientId: data.patientId ?? null,
      authorId: ctx.userId,
      content: data.content,
    },
    // Volta completa p/ o card fazer append otimista sem re-listar.
    include: { author: { select: { id: true, name: true } } },
  })
}

export async function softDeleteClinicNote(ctx: ClinicContext, noteId: string) {
  // where com clientId — só apaga anotação da própria clínica (belt).
  return prisma.clientNote.updateMany({
    where: { id: noteId, clientId: ctx.clientId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
