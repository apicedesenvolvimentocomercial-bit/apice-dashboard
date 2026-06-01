'use server'

import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { getClinicContext } from '@/server/auth/clinic-context'
import { fail, NotFoundError, runAction } from '@/types/errors'

import { resolveClinicActivityTarget } from '../activities/activity-repository'
import { createClinicNote, listClinicNotesForTarget, softDeleteClinicNote } from './note-repository'

/**
 * Anotações do card do cliente (item 6). Reusa o resolver de alvo das atividades
 * (valida lead/paciente contra a clínica) e o gate `activities:write/read` —
 * anotações são parte do mesmo módulo de relacionamento com cliente.
 */

const subjectSchema = z.object({ type: z.enum(['lead', 'patient']), id: z.string().min(1) })

async function targetForSubject(
  ctx: Awaited<ReturnType<typeof getClinicContext>>,
  subject: { type: 'lead' | 'patient'; id: string }
) {
  if (subject.type === 'lead') return { leadId: subject.id }
  const leads = await prisma.lead.findMany({
    where: { patientId: subject.id, clientId: ctx.clientId, deletedAt: null },
    select: { id: true },
  })
  return { patientId: subject.id, leadIds: leads.map((l) => l.id) }
}

export async function getCardNotesAction(subjectInput: unknown) {
  const parsed = subjectSchema.safeParse(subjectInput)
  if (!parsed.success) return fail('Alvo inválido')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'read')
    const target = await targetForSubject(ctx, parsed.data)
    const rows = await listClinicNotesForTarget(ctx, target)
    return rows.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      author: n.author,
    }))
  })
}

export async function createClinicNoteAction(subjectInput: unknown, content: unknown) {
  const parsed = subjectSchema.safeParse(subjectInput)
  if (!parsed.success) return fail('Alvo inválido')
  const text = typeof content === 'string' ? content.trim() : ''
  if (text.length === 0) return fail('Anotação vazia')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')
    const resolved = await resolveClinicActivityTarget(ctx, parsed.data.type, parsed.data.id)
    if (!resolved) throw new NotFoundError(parsed.data.type === 'lead' ? 'Lead' : 'Paciente')

    const note = await createClinicNote(ctx, {
      content: text,
      leadId: resolved.leadId,
      patientId: resolved.patientId,
    })
    return { id: note.id }
  })
}

export async function deleteClinicNoteAction(noteId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'activities', 'write')
    await softDeleteClinicNote(ctx, noteId)
    return null
  })
}
