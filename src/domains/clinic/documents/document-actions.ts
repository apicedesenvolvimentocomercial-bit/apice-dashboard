'use server'

import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import {
  CLIENT_DOCUMENTS_BUCKET,
  getSupabaseAdmin,
  isDocumentStorageConfigured,
} from '@/lib/supabase'
import { assertCan } from '@/server/auth/assert-can'
import { getClinicContext } from '@/server/auth/clinic-context'
import { AppError, fail, NotFoundError, runAction } from '@/types/errors'

import { resolveClinicActivityTarget } from '../activities/activity-repository'
import {
  createClinicDocument,
  findClinicDocumentById,
  listClinicDocumentsForTarget,
  softDeleteClinicDocument,
} from './document-repository'

/**
 * Documentos do card do cliente (item 6c). O binário sobe p/ um bucket PRIVADO
 * do Supabase (criptografia em repouso); aqui guardamos metadados + a chave.
 * Acesso por URL assinada de curta duração. Degrada se o Supabase não estiver
 * configurado (banco de teste / antes do setup) — sem quebrar o card.
 */

const MAX_SIZE = 25 * 1024 * 1024 // 25 MB
const subjectSchema = z.object({ type: z.enum(['lead', 'patient']), id: z.string().min(1) })

function storageError(msg: string): never {
  // Erro operacional de storage → vira Result.fail via runAction (não 500).
  throw new AppError('STORAGE', msg, 400)
}

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

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'arquivo'
  )
}

export async function getCardDocumentsAction(subjectInput: unknown) {
  const parsed = subjectSchema.safeParse(subjectInput)
  if (!parsed.success) return fail('Alvo inválido')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'patients', 'read')
    if (!isDocumentStorageConfigured()) {
      return { configured: false as const, documents: [] }
    }
    const target = await targetForSubject(ctx, parsed.data)
    const rows = await listClinicDocumentsForTarget(ctx, target)
    return {
      configured: true as const,
      documents: rows.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt,
        uploader: d.uploader,
      })),
    }
  })
}

export async function uploadCardDocumentAction(formData: FormData) {
  const type = formData.get('targetType')
  const id = formData.get('targetId')
  const file = formData.get('file')
  const parsed = subjectSchema.safeParse({ type, id })
  if (!parsed.success) return fail('Alvo inválido')
  if (!(file instanceof File) || file.size === 0) return fail('Selecione um arquivo')
  if (file.size > MAX_SIZE) return fail('Arquivo acima de 25 MB')

  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'patients', 'write')

    const supabase = getSupabaseAdmin()
    if (!supabase) storageError('Armazenamento de documentos não configurado')

    const resolved = await resolveClinicActivityTarget(ctx, parsed.data.type, parsed.data.id)
    if (!resolved) throw new NotFoundError(parsed.data.type === 'lead' ? 'Lead' : 'Paciente')

    const safeName = sanitizeName(file.name)
    const storagePath = `${ctx.clientId}/${crypto.randomUUID()}/${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (error) storageError('Falha ao enviar o arquivo: ' + error.message)

    const doc = await createClinicDocument(ctx, {
      leadId: resolved.leadId,
      patientId: resolved.patientId,
      fileName: safeName,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      storagePath,
    })
    return { id: doc.id }
  })
}

export async function getDocumentDownloadUrlAction(docId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'patients', 'read')
    const supabase = getSupabaseAdmin()
    if (!supabase) storageError('Armazenamento de documentos não configurado')

    const doc = await findClinicDocumentById(ctx, docId)
    if (!doc) throw new NotFoundError('Documento')

    const { data, error } = await supabase.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storagePath, 60) // 60s
    if (error || !data) storageError('Falha ao gerar link do arquivo')
    return { url: data.signedUrl, fileName: doc.fileName }
  })
}

export async function deleteCardDocumentAction(docId: string) {
  return runAction(async () => {
    const ctx = await getClinicContext()
    await assertCan(ctx, 'patients', 'write')
    const doc = await findClinicDocumentById(ctx, docId)
    if (!doc) throw new NotFoundError('Documento')

    const supabase = getSupabaseAdmin()
    // Best-effort no storage; o registro é soft-deletado de qualquer forma.
    if (supabase) {
      await supabase.storage
        .from(CLIENT_DOCUMENTS_BUCKET)
        .remove([doc.storagePath])
        .catch(() => {})
    }
    await softDeleteClinicDocument(ctx, docId)
    return null
  })
}
