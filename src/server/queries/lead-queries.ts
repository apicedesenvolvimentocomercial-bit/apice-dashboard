import type { PipelineKind } from '@prisma/client'

import { getPipeline, findLeadById, type PipelineData } from '@/server/repositories/lead-repository'
import { listProceduresForSelect } from '@/server/repositories/procedure-repository'
import { ensureNativePipelines, listPipelines } from '@/server/repositories/pipeline-repository'
import { getClinicSchedule } from '@/server/repositories/clinic-schedule-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertCan } from '@/server/auth/assert-can'
import { resolveOwnerScope } from '@/server/auth/owner-scope'

/** Etapas (+leads) de uma pipeline específica da clínica. */
export async function getPipelineData(clientId: string, pipelineId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'crm', 'read')
  const ownerId = await resolveOwnerScope(ctx, 'crm')
  return getPipeline(ctx, clientId, pipelineId, ownerId)
}

/**
 * Lista as pipelines da clínica (garante as nativas antes). Usado pela página
 * de CRM para montar as abas dinâmicas.
 */
export async function listClinicPipelines(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'crm', 'read')
  await ensureNativePipelines(clientId, ctx.organizationId)
  const ownerId = await resolveOwnerScope(ctx, 'crm')
  return listPipelines(ctx, clientId, ownerId)
}

/**
 * Procedimentos da clínica para o dialog de Agendado (2a). Gateado por `crm`
 * (não `procedures`) porque é o operador do funil que agenda — a página de CRM
 * já garante a permissão de crm. Retorna [] se a clínica não tem procedimentos.
 */
export async function getProceduresForScheduling(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'crm', 'read')
  const procs = await listProceduresForSelect(ctx, clientId)
  return procs.map((p) => ({
    id: p.id,
    name: p.name,
    durationMinutes: p.durationMinutes ?? 60,
    price: p.price,
  }))
}

/**
 * Expediente da clínica (dias úteis, horário, feriados) para o dialog de Agendado
 * do pipeline aplicar as MESMAS validações da agenda. Gateado por `crm` (o
 * operador do funil que agenda), igual a `getProceduresForScheduling`.
 */
export async function getScheduleForScheduling(clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'crm', 'read')
  return getClinicSchedule(clientId)
}

export type PipelineWithStages = {
  id: string
  name: string
  kind: PipelineKind
  order: number
  stages: PipelineData
}

/**
 * Todas as pipelines da clínica já com suas etapas+leads. Carrega tudo de uma
 * vez (≤6 funis, cada um pequeno) para a página montar as abas com SSR.
 */
export async function getClinicPipelinesWithStages(
  clientId: string
): Promise<PipelineWithStages[]> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta query
  await assertCan(ctx, 'crm', 'read')
  await ensureNativePipelines(clientId, ctx.organizationId)
  const ownerId = await resolveOwnerScope(ctx, 'crm')
  const pipelines = await listPipelines(ctx, clientId, ownerId)
  const withStages = await Promise.all(
    pipelines.map(async (p) => ({
      ...p,
      // Retenção = base de pacientes COMPARTILHADA (cards são espelhos de paciente,
      // criados por cron/manual sem dono natural) — não filtra por dono. Comercial e
      // pipelines custom filtram (cada um vê seus cards).
      stages: await getPipeline(ctx, clientId, p.id, p.kind === 'RETENTION' ? null : ownerId),
    }))
  )
  return withStages
}

export async function getLead(clientId: string, leadId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'crm', 'read')
  return findLeadById(ctx, clientId, leadId)
}
