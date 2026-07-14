import type { LeadSource } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>
export type FullLead = Awaited<ReturnType<typeof findLeadById>>

/** Cards carregados por coluna no SSR e por página do “carregar mais” (M1 do
 *  plano de correções — antes era ILIMITADO: a retenção tem 1 card por paciente
 *  e o payload do CRM crescia sem teto com a base). */
export const KANBAN_CARDS_PAGE = 50

// Shape de card do kanban — compartilhado pelo SSR (getPipeline) e pelo
// "carregar mais" (listStageLeads); precisa casar com KanbanLead da UI.
const kanbanLeadSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  procedureInterest: true,
  tags: true,
  createdAt: true,
  stageId: true,
  position: true,
  appointmentId: true,
  // Retorno esperado do paciente (reforma da retenção) — o card de retenção
  // mostra "retorno em {data}" / "atrasado há Nd". Null fora da retenção.
  // `id`: o card de retenção abre o card UNIFICADO de PACIENTE (mesmo da aba
  // Pacientes / busca) — precisa do patientId no clique.
  patient: { select: { id: true, nextReturnDueAt: true } },
} as const

/**
 * Etapas de uma pipeline (com a 1ª PÁGINA de leads + total real por etapa).
 * Escopa via `pipeline.organizationId` para a barreira de org no nível do repo
 * (SEC-002). A pipeline em si (e as nativas semeadas) é garantida fora daqui —
 * ver pipeline-repository.
 */
export async function getPipeline(
  ctx: TenantContext,
  clientId: string,
  pipelineId: string,
  // Item 4: filtro por dono. `null` = ver todos os cards (admin/titular/viewAll);
  // userId = só os cards desse usuário (Lead.assignedToId).
  ownerId: string | null = null
) {
  const leadsWhere = {
    organizationId: ctx.organizationId,
    clientId,
    deletedAt: null,
    ...(ownerId ? { assignedToId: ownerId } : {}),
  }
  const stages = await prisma.pipelineStage.findMany({
    where: {
      pipelineId,
      clientId,
      pipeline: { organizationId: ctx.organizationId },
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      isWon: true,
      isLost: true,
      isNative: true,
      nativeKey: true,
      order: true,
      leads: {
        where: leadsWhere,
        // id como desempate → ordem estável p/ o cursor do "carregar mais".
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        take: KANBAN_CARDS_PAGE,
        select: kanbanLeadSelect,
      },
      // Total REAL da coluna (a UI mostra o badge e decide o "carregar mais").
      _count: { select: { leads: { where: leadsWhere } } },
    },
  })
  return stages.map(({ _count, ...stage }) => ({ ...stage, totalLeads: _count.leads }))
}

/**
 * Próxima página de cards de UMA etapa (cursor = id do último card carregado),
 * na mesma ordem estável do SSR (position, id). Consumido pelo
 * `loadStageLeadsAction` (botão "carregar mais" da coluna).
 */
export async function listStageLeads(
  ctx: TenantContext,
  clientId: string,
  stageId: string,
  opts?: { cursor?: string; ownerId?: string | null; take?: number }
) {
  const take = opts?.take ?? KANBAN_CARDS_PAGE
  const rows = await prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      stageId,
      deletedAt: null,
      ...(opts?.ownerId ? { assignedToId: opts.ownerId } : {}),
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    take: take + 1, // sonda de hasMore
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: kanbanLeadSelect,
  })
  const hasMore = rows.length > take
  const pageRows = hasMore ? rows.slice(0, take) : rows
  return { rows: pageRows, hasMore }
}

/**
 * Busca global de cards em TODAS as pipelines da clínica (M1 — a busca era
 * client-side sobre o SSR; com páginas de 50, cards além da 1ª página sumiriam
 * dela). Nome/e-mail por substring case-insensitive; telefone por substring dos
 * DÍGITOS digitados (best-effort: telefone armazenado com máscara pode escapar).
 * Mesmo escopo de dono do board: retenção compartilhada, demais por `ownerId`.
 */
export async function searchLeads(
  ctx: TenantContext,
  clientId: string,
  term: string,
  ownerId: string | null,
  limit = 25
) {
  const q = term.trim()
  if (q.length < 2) return []
  const qDigits = q.replace(/\D/g, '')
  const matchers: object[] = [
    { name: { contains: q, mode: 'insensitive' as const } },
    { email: { contains: q, mode: 'insensitive' as const } },
  ]
  if (qDigits.length >= 3) matchers.push({ phone: { contains: qDigits } })

  return prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(ownerId
        ? { OR: [{ stage: { pipeline: { kind: 'RETENTION' } } }, { assignedToId: ownerId }] }
        : {}),
      AND: [{ OR: matchers }],
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      ...kanbanLeadSelect,
      stage: {
        select: { name: true, pipeline: { select: { id: true, name: true } } },
      },
    },
  })
}

/**
 * Renumera as posições de uma coluna (Fase 4 — esgotamento da bissecção de
 * Float): reordena os cards da etapa em passos de 1000, colocando `leadId`
 * antes de `beforeLeadId` (ou no fim, se null). Transação com escopo (RLS) e
 * belt de clientId em cada update. Retorna o nº de cards renumerados; 0 = o
 * lead não pertence à etapa (caller falha).
 */
export async function rebalanceStageLeads(
  ctx: TenantContext,
  clientId: string,
  stageId: string,
  leadId: string,
  beforeLeadId: string | null
): Promise<number> {
  return scopedTransaction(async (tx) => {
    const rows = await tx.lead.findMany({
      where: { organizationId: ctx.organizationId, clientId, stageId, deletedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    })
    if (!rows.some((r) => r.id === leadId)) return 0

    const rest = rows.filter((r) => r.id !== leadId)
    let insertIdx = rest.length
    if (beforeLeadId) {
      const i = rest.findIndex((r) => r.id === beforeLeadId)
      if (i >= 0) insertIdx = i
    }
    const ordered = [...rest.slice(0, insertIdx), { id: leadId }, ...rest.slice(insertIdx)]

    for (let i = 0; i < ordered.length; i++) {
      await tx.lead.updateMany({
        where: { id: ordered[i].id, clientId },
        data: { position: (i + 1) * 1000 },
      })
    }
    return ordered.length
  })
}

export async function findLeadById(ctx: TenantContext, clientId: string, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    include: {
      stage: { select: { id: true, name: true, color: true, isWon: true, isLost: true } },
      interactions: { orderBy: { createdAt: 'desc' } },
    },
  })
}

/**
 * Card de RETENÇÃO do paciente — a MESMA `Lead` que aparece no funil de Retenção
 * (1 por paciente), com as interações. Alimenta o card UNIFICADO de paciente
 * (aba Pacientes / busca do topbar), que passa a mostrar a timeline de interações
 * e o "Mover para funil" além dos dados clínicos, igual ao card do funil.
 * `clientId` no where (belt) + escopo de RLS na action (suspenders).
 */
export async function findRetentionLeadForPatient(
  ctx: TenantContext,
  clientId: string,
  patientId: string
) {
  return prisma.lead.findFirst({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      patientId,
      deletedAt: null,
      stage: { pipeline: { kind: 'RETENTION' } },
    },
    select: {
      id: true,
      stage: { select: { pipelineId: true, pipeline: { select: { category: true } } } },
      interactions: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, content: true, createdAt: true },
      },
    },
  })
}

/**
 * Card COMERCIAL (não-retenção) ativo ligado a um paciente — `Lead.patientId` é
 * setado ao agendar (paciente provisório). Alimenta a busca do topbar: pessoa que
 * ainda é lead abre o MESMO card do funil comercial, não o card de paciente.
 * Traz as etapas do funil dono (sem cards — o drawer só precisa da estrutura).
 */
export async function findCommercialLeadForPatient(
  ctx: TenantContext,
  clientId: string,
  patientId: string
) {
  return prisma.lead.findFirst({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      patientId,
      deletedAt: null,
      stage: { pipeline: { kind: { not: 'RETENTION' } } },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      stage: {
        select: {
          pipeline: {
            select: {
              id: true,
              kind: true,
              category: true,
              stages: {
                orderBy: { order: 'asc' },
                select: {
                  id: true,
                  name: true,
                  color: true,
                  isWon: true,
                  isLost: true,
                  isNative: true,
                  nativeKey: true,
                  order: true,
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function createLead(
  ctx: TenantContext,
  clientId: string,
  data: {
    name: string
    phone?: string
    email?: string
    source: LeadSource
    stageId: string
    procedureInterest?: string
    procedureInterestIds?: string[]
    estimatedValue?: number
    notes?: string
    tags?: string[]
  }
) {
  // Procedimentos de interesse estruturados: valida que são da clínica, deriva o
  // rótulo (nomes) e — se o valor estimado não veio — soma os preços.
  let procedureInterest = data.procedureInterest
  let estimatedValue = data.estimatedValue
  const ids = data.procedureInterestIds ?? []
  if (ids.length > 0) {
    const procs = await prisma.procedure.findMany({
      where: { id: { in: ids }, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true, price: true },
    })
    if (procs.length > 0) {
      procedureInterest = procs.map((p) => p.name).join(', ')
      if (estimatedValue == null) {
        estimatedValue = procs.reduce((sum, p) => sum + Number(p.price), 0)
      }
    }
  }

  return prisma.lead.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      source: data.source,
      stageId: data.stageId,
      procedureInterest,
      procedureInterestIds: ids,
      estimatedValue,
      notes: data.notes,
      tags: data.tags ?? [],
      // Item 4: dono = criador por padrão (reatribuível depois).
      assignedToId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  })
}

/**
 * Cria um card no funil EXISTING a partir de um paciente já cadastrado. O card
 * continua sendo um `Lead` (reusa board/dnd/actions), mas com `patientId` setado
 * e dados copiados do paciente. `source` fixo em WALK_IN (cliente já presente).
 */
export async function createLeadForPatient(
  ctx: TenantContext,
  clientId: string,
  patientId: string,
  stageId: string
) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: { name: true, phone: true, email: true },
  })
  if (!patient) return null

  return prisma.lead.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      source: 'WALK_IN',
      stageId,
      patientId,
      assignedToId: ctx.userId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  })
}

/**
 * Pacientes da clínica que ainda não têm um card ativo no funil EXISTING.
 * Usado pelo dialog de "adicionar cliente" para não duplicar cards.
 */
export async function listPatientsWithoutExistingCard(ctx: TenantContext, clientId: string) {
  return prisma.patient.findMany({
    where: {
      clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      leads: {
        none: {
          deletedAt: null,
          stage: { pipeline: { kind: 'RETENTION' } },
        },
      },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, phone: true },
  })
}

export async function updateLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  data: Partial<{
    name: string
    phone: string
    email: string
    source: LeadSource
    stageId: string
    procedureInterest: string
    estimatedValue: number
    notes: string
  }>
) {
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { ...data, updatedById: ctx.userId },
  })
}

export async function moveLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  stageId: string,
  position?: number
) {
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } })

  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      stageId,
      ...(position !== undefined ? { position } : {}),
      updatedById: ctx.userId,
      ...(stage?.isWon ? { closedAt: new Date() } : {}),
      ...(stage?.isLost ? { lostAt: new Date() } : {}),
    },
  })
}

export async function reorderLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  position: number
) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { position, updatedById: ctx.userId },
  })
}

/** Item 4: reatribui o dono de um lead (assignedToId). clientId no where (belt). */
export async function reassignLead(
  ctx: TenantContext,
  leadId: string,
  clientId: string,
  assignedToId: string
) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { assignedToId, updatedById: ctx.userId },
  })
}

export async function softDeleteLead(ctx: TenantContext, leadId: string, clientId: string) {
  return prisma.lead.updateMany({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
