'use server'

import { z } from 'zod'

import { assertCan } from '@/server/auth/assert-can'
import { getClinicContext } from '@/server/auth/clinic-context'
import { fail, NotFoundError, runAction } from '@/types/errors'

import { resolveClinicActivityTarget } from '../activities/activity-repository'
import { createClinicNote, softDeleteClinicNote } from './note-repository'

/**
 * Anotações do card do cliente (item 6). Reusa o resolver de alvo das atividades
 * (valida lead/paciente contra a clínica) e o gate `activities:write/read` —
 * anotações são parte do mesmo módulo de relacionamento com cliente. A LISTAGEM
 * vive na carga unificada do card (`getClientCardAction`).
 */

const subjectSchema = z.object({ type: z.enum(['lead', 'patient']), id: z.string().min(1) })

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
    // Nota completa → o card faz append otimista sem re-listar.
    return { id: note.id, content: note.content, createdAt: note.createdAt, author: note.author }
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
