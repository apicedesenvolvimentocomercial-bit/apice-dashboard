'use server'

import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { isDocumentStorageConfigured } from '@/lib/supabase'
import {
  listClinicActivitiesForTarget,
  listClinicMembers,
} from '@/domains/clinic/activities/activity-repository'
import { listClinicDocumentsForTarget } from '@/domains/clinic/documents/document-repository'
import { listClinicNotesForTarget } from '@/domains/clinic/notes/note-repository'
import { getClinicContext } from '@/server/auth/clinic-context'
import { getPermissionChecker } from '@/server/auth/permissions'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { findLeadById, findRetentionLeadForPatient } from '@/server/repositories/lead-repository'
import { findPatientById } from '@/server/repositories/patient-repository'
import { listPipelines } from '@/server/repositories/pipeline-repository'
import { fail, NotFoundError, runAction } from '@/types/errors'

/**
 * Carga ÚNICA do card do cliente (drawer): detalhe do lead/paciente + abas
 * (atividades, anotações, documentos) + contexto de retenção do paciente, num
 * só roundtrip. Substitui as 4–5 actions que o card disparava ao abrir — cada
 * uma pagava sessão + contexto + `can()` (≈3 idas ao banco) de novo.
 *
 * Permissões: `getPermissionChecker` resolve coroa/cargo com 1 query e cada
 * parte degrada como as actions antigas — sem `crm:read` o lead não vem; sem
 * `activities:read` a aba de atividades desabilita e anotações ficam vazias;
 * sem `patients:read` documentos ficam vazios. Atividades/anotações/documentos
 * são do DOMÍNIO clínica: no painel admin o card degrada igual (abas vazias).
 */

const subjectSchema = z.object({ type: z.enum(['lead', 'patient']), id: z.string().min(1) })

export async function getClientCardAction(clientId: string, subjectInput: unknown) {
  const parsed = subjectSchema.safeParse(subjectInput)
  if (!parsed.success) return fail('Alvo inválido')
  const subject = parsed.data

  return runAction(async () => {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)

    const allowed = await getPermissionChecker(ctx.userId, ctx.role)

    const isClinicUser = ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF'
    const clinicCtx = isClinicUser ? await getClinicContext() : null
    // Narrowing por variável: só entram nas queries de clínica quando o gate passa.
    const activitiesCtx = clinicCtx && allowed('activities', 'read') ? clinicCtx : null
    const docsCtx = clinicCtx && allowed('patients', 'read') ? clinicCtx : null

    const detailAllowed =
      subject.type === 'lead' ? allowed('crm', 'read') : allowed('patients', 'read')

    // Alvo das listas de atividades/anotações/documentos — no paciente inclui
    // os leads ligados (continuidade). 1 query, compartilhada pelas três.
    let target: { leadId?: string; patientId?: string; leadIds?: string[] } = {}
    if (subject.type === 'lead') {
      target = { leadId: subject.id }
    } else if (activitiesCtx || docsCtx) {
      const leads = await prisma.lead.findMany({
        where: { patientId: subject.id, clientId, deletedAt: null },
        select: { id: true },
      })
      target = { patientId: subject.id, leadIds: leads.map((l) => l.id) }
    }

    // Engajamento de retenção do card de PACIENTE (ex-getPatientRetentionContextAction):
    // é do módulo CRM — sem leitura, o card fica só clínico (`retention: null`).
    const retentionAllowed = subject.type === 'patient' && detailAllowed && allowed('crm', 'read')
    // Espelho de resolveOwnerScope(ctx, 'crm') sem a query extra do can().
    const crmViewerId = !isClinicUser || allowed('crm', 'viewAll') ? null : ctx.userId

    const docsConfigured = isDocumentStorageConfigured()

    const [
      lead,
      patient,
      activityRows,
      members,
      pref,
      noteRows,
      docRows,
      retentionLead,
      pipelines,
    ] = await Promise.all([
      subject.type === 'lead' && detailAllowed ? findLeadById(ctx, clientId, subject.id) : null,
      subject.type === 'patient' && detailAllowed
        ? findPatientById(ctx, clientId, subject.id)
        : null,
      activitiesCtx ? listClinicActivitiesForTarget(activitiesCtx, target) : [],
      activitiesCtx ? listClinicMembers(activitiesCtx) : [],
      activitiesCtx
        ? prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { activityCalendarSync: true },
          })
        : null,
      activitiesCtx ? listClinicNotesForTarget(activitiesCtx, target) : [],
      docsCtx && docsConfigured ? listClinicDocumentsForTarget(docsCtx, target) : [],
      retentionAllowed ? findRetentionLeadForPatient(ctx, clientId, subject.id) : null,
      retentionAllowed ? listPipelines(ctx, clientId, crmViewerId) : [],
    ])

    if (subject.type === 'lead' && detailAllowed && !lead) throw new NotFoundError('Lead')
    if (subject.type === 'patient' && detailAllowed && !patient) throw new NotFoundError('Paciente')

    return {
      lead: lead
        ? { ...lead, estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null }
        : null,
      patient,
      activitiesEnabled: activitiesCtx !== null,
      activities: activityRows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.type,
        customTypeLabel: r.customType?.label ?? null,
        status: r.status,
        priority: r.priority,
        dueDate: r.dueDate,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        seenByAssigneeAt: r.seenByAssigneeAt,
        broadcastId: r.broadcastId,
        client: null,
        assignedTo: r.assignedTo,
        createdBy: r.createdBy,
        target: r.lead
          ? ({ type: 'lead', id: r.lead.id, name: r.lead.name } as const)
          : r.patient
            ? ({ type: 'patient', id: r.patient.id, name: r.patient.name } as const)
            : null,
      })),
      members: members.map((m) => ({ id: m.id, name: m.name })),
      canAssignOthers: clinicCtx !== null && allowed('activities', 'assignToOthers'),
      canReassignLeads: clinicCtx !== null && allowed('crm', 'assignToOthers'),
      syncPref: (pref?.activityCalendarSync ?? 'ASK') as 'AUTO' | 'ASK' | 'NEVER',
      notes: noteRows.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        author: n.author,
      })),
      docsConfigured,
      documents: docRows.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt,
        uploader: d.uploader,
      })),
      retention: retentionLead
        ? {
            leadId: retentionLead.id,
            pipelineId: retentionLead.stage.pipelineId,
            pipelineCategory: retentionLead.stage.pipeline.category,
            pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, category: p.category })),
            interactions: retentionLead.interactions,
          }
        : null,
    }
  })
}
