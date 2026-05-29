import type { Prisma, StageNativeKey } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decideCancellationStatus } from '@/lib/no-show-window'
import type { TenantContext } from '@/server/tenant/context'
import { scopedTransaction } from '@/server/tenant/scoped-transaction'

/**
 * Efeitos de negócio disparados quando um card (Lead) entra numa etapa NATIVA
 * (Fase 2). O efeito é decidido pelo `nativeKey` da etapa, nunca pelo nome.
 * Cada efeito roda em transação única reusando os repos/services existentes.
 *
 * - SCHEDULED (2a): cria Appointment + converte em Patient.
 * - ATTENDED/NO_SHOW (2b): marca o Appointment (KPIs derivam do status).
 * - CLOSED (2c): garante ATTENDED + dá baixa financeira (Revenue).
 * - Retrocesso (2d): desfaz os efeitos acima.
 */

// Rank canônico na cadeia COMMERCIAL. NO_SHOW é desfecho fora da cadeia linear
// mas tratamos como ≥ ATTENDED p/ detectar retrocesso a partir dele.
const COMMERCIAL_RANK: Partial<Record<StageNativeKey, number>> = {
  LEAD: 0,
  SCHEDULED: 1,
  ATTENDED: 2,
  NO_SHOW: 2,
  CLOSED: 3,
}

/**
 * Garante um Patient para o lead. Se o lead já está vinculado (`patientId`),
 * reusa; senão cria a partir dos dados do lead. Idempotente dentro da tx.
 * Extraído para ser reusado por winLead/agendamento.
 */
async function ensurePatientForLead(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  lead: {
    id: string
    clientId: string
    name: string
    phone: string | null
    email: string | null
    patientId: string | null
  }
): Promise<string> {
  if (lead.patientId) return lead.patientId
  const patient = await tx.patient.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: lead.clientId,
      name: lead.name,
      phone: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      firstVisitAt: new Date(),
      // Criado ao agendar — só vira "paciente real" na aba se comparecer.
      fromScheduledLead: true,
    },
  })
  return patient.id
}

export type ScheduleResult =
  | { ok: true; appointmentId: string; patientId: string }
  | { ok: false; reason: 'lead-not-found' | 'procedure-not-found' | 'stage-not-found' }

/**
 * 2a — Move o lead para a etapa SCHEDULED criando o Appointment obrigatório.
 * Converte o lead em Patient (se ainda não for), cria o Appointment (status
 * SCHEDULED), e liga `Lead.appointmentId` + `patientId` + `scheduledAt` + etapa
 * destino. Tudo numa transação: se algo falhar, nada persiste.
 */
export async function scheduleLeadAppointment(
  ctx: TenantContext,
  params: {
    clientId: string
    leadId: string
    stageId: string // etapa SCHEDULED destino
    procedureId: string
    scheduledAt: Date
    durationMinutes: number
    position?: number
    notes?: string
  }
): Promise<ScheduleResult> {
  // clientId no lookup (belt): rejeita lead de clínica-irmã da mesma org.
  const lead = await prisma.lead.findFirst({
    where: {
      id: params.leadId,
      clientId: params.clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    select: { id: true, clientId: true, name: true, phone: true, email: true, patientId: true },
  })
  if (!lead) return { ok: false, reason: 'lead-not-found' }

  // Etapa destino precisa ser desta clínica (defesa contra stageId cruzado).
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: params.stageId, clientId: lead.clientId },
    select: { id: true },
  })
  if (!stage) return { ok: false, reason: 'stage-not-found' }

  // Procedimento precisa ser da org.
  const procedure = await prisma.procedure.findFirst({
    where: { id: params.procedureId, organizationId: ctx.organizationId },
    select: { id: true },
  })
  if (!procedure) return { ok: false, reason: 'procedure-not-found' }

  return scopedTransaction(async (tx) => {
    const patientId = await ensurePatientForLead(tx, ctx, lead)

    const appointment = await tx.appointment.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: lead.clientId,
        patientId,
        procedureId: params.procedureId,
        scheduledAt: params.scheduledAt,
        durationMinutes: params.durationMinutes,
        status: 'SCHEDULED',
        notes: params.notes,
        createdById: ctx.userId,
      },
    })

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        stageId: params.stageId,
        ...(params.position !== undefined ? { position: params.position } : {}),
        patientId,
        appointmentId: appointment.id,
        scheduledAt: params.scheduledAt,
        updatedById: ctx.userId,
      },
    })

    await tx.leadInteraction.create({
      data: {
        leadId: lead.id,
        type: 'MEETING',
        content: 'Agendamento criado ao mover o card para Agendado.',
        createdById: ctx.userId,
      },
    })

    return { ok: true as const, appointmentId: appointment.id, patientId }
  })
}

// Carrega o contexto de um move: lead (com appointment) + etapa origem/destino.
async function loadMoveContext(
  ctx: TenantContext,
  clientId: string,
  leadId: string,
  stageId: string
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      stageId: true,
      patientId: true,
      appointmentId: true,
      stage: { select: { nativeKey: true } },
      appointment: {
        select: { id: true, status: true, scheduledAt: true, procedureId: true, patientId: true },
      },
    },
  })
  if (!lead) return null

  const destStage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, clientId: lead.clientId },
    select: { id: true, nativeKey: true },
  })
  if (!destStage) return null

  return { lead, fromKey: lead.stage.nativeKey, destKey: destStage.nativeKey }
}

export type MoveEffectResult =
  | { ok: true; moved: true }
  | { ok: false; reason: 'not-found' }
  // Falta o agendamento (card não passou por Agendado). Cliente bloqueia.
  | { ok: false; reason: 'no-appointment'; key: StageNativeKey }
  // Retrocesso detectado: cliente deve confirmar e chamar regressLeadStage.
  | { needsConfirm: 'regress'; fromKey: StageNativeKey; toKey: StageNativeKey | null }
  // Fechar antes do horário do agendamento: cliente confirma e re-chama com force.
  | { needsConfirm: 'close-early'; scheduledAt: Date }

/**
 * Move um lead aplicando o efeito da etapa destino (2b/2c) e detectando
 * retrocesso (2d). NÃO executa o desfazer — só sinaliza `needsConfirm:'regress'`
 * para o cliente confirmar. `force` pula a confirmação de fechar-antes-do-horário.
 */
export async function moveLeadWithEffect(
  ctx: TenantContext,
  params: { clientId: string; leadId: string; stageId: string; position?: number; force?: boolean }
): Promise<MoveEffectResult> {
  const loaded = await loadMoveContext(ctx, params.clientId, params.leadId, params.stageId)
  if (!loaded) return { ok: false, reason: 'not-found' }
  const { lead, fromKey, destKey } = loaded

  // Retrocesso na cadeia COMMERCIAL: rank destino < rank origem → exige confirmar.
  if (fromKey && destKey) {
    const fromRank = COMMERCIAL_RANK[fromKey]
    const toRank = COMMERCIAL_RANK[destKey]
    if (fromRank !== undefined && toRank !== undefined && toRank < fromRank) {
      return { needsConfirm: 'regress', fromKey, toKey: destKey }
    }
  } else if (fromKey && !destKey) {
    // Sai de uma etapa nativa para uma etapa LIVRE com rank menor (ex.: livre
    // posicionada antes). Sem destKey não há rank — tratamos como retrocesso só
    // se a origem tinha efeito aplicado (appointment/revenue). Conservador:
    // se há appointment e a origem é ≥ ATTENDED, pede confirmação.
    if (
      lead.appointmentId &&
      (fromKey === 'ATTENDED' || fromKey === 'NO_SHOW' || fromKey === 'CLOSED')
    ) {
      return { needsConfirm: 'regress', fromKey, toKey: null }
    }
  }

  const position = params.position

  // 2b — Compareceu: exige appointment; marca ATTENDED (limpa marcas de falta/cancel).
  if (destKey === 'ATTENDED') {
    if (!lead.appointmentId) return { ok: false, reason: 'no-appointment', key: destKey }
    await scopedTransaction(async (tx) => {
      await tx.appointment.update({
        where: { id: lead.appointmentId! },
        data: {
          status: 'ATTENDED',
          attendedAt: new Date(),
          noShowAt: null,
          canceledAt: null,
          cancelReason: null,
        },
      })
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: params.stageId,
          ...(position !== undefined ? { position } : {}),
          attendedAt: new Date(),
          lostAt: null,
          updatedById: ctx.userId,
        },
      })
    })
    return { ok: true, moved: true }
  }

  // 2b — Cancelado: o sistema decide se conta como NO_SHOW (entra na média) ou
  // CANCELED (cancelamento comum, fora da média), pela janela de cancelamento da
  // clínica. Sem agendamento, é só um lead perdido (sem efeito de appointment).
  if (destKey === 'NO_SHOW') {
    const now = new Date()
    if (lead.appointmentId && lead.appointment) {
      const client = await prisma.client.findFirst({
        where: { id: lead.clientId },
        select: { noShowWindowHours: true },
      })
      const status = decideCancellationStatus(
        lead.appointment.scheduledAt,
        now,
        client?.noShowWindowHours ?? null
      )
      await scopedTransaction(async (tx) => {
        await tx.appointment.update({
          where: { id: lead.appointmentId! },
          data:
            status === 'NO_SHOW'
              ? { status: 'NO_SHOW', noShowAt: now, canceledAt: null, cancelReason: null }
              : {
                  status: 'CANCELED',
                  canceledAt: now,
                  cancelReason: 'Cancelado antes do dia do procedimento',
                  noShowAt: null,
                },
        })
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            stageId: params.stageId,
            ...(position !== undefined ? { position } : {}),
            lostAt: now,
            updatedById: ctx.userId,
          },
        })
      })
    } else {
      // Sem agendamento: cancelamento de um lead que nunca chegou a ser agendado.
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stageId: params.stageId,
          ...(position !== undefined ? { position } : {}),
          lostAt: now,
          updatedById: ctx.userId,
        },
      })
    }
    return { ok: true, moved: true }
  }

  // 2c — Fechado: exige appointment; opcionalmente confirma se ainda não ocorreu;
  // garante ATTENDED e dá baixa financeira (Revenue) do procedimento.
  if (destKey === 'CLOSED') {
    if (!lead.appointmentId || !lead.appointment) {
      return { ok: false, reason: 'no-appointment', key: destKey }
    }
    if (!params.force && lead.appointment.scheduledAt.getTime() > Date.now()) {
      return { needsConfirm: 'close-early', scheduledAt: lead.appointment.scheduledAt }
    }
    await scopedTransaction(async (tx) => {
      // Marca ATTENDED se ainda não foi (compareceu, logo fechou). Limpa marcas
      // de falta/cancelamento caso o card tenha passado por "Cancelado".
      if (lead.appointment!.status !== 'ATTENDED') {
        await tx.appointment.update({
          where: { id: lead.appointmentId! },
          data: {
            status: 'ATTENDED',
            attendedAt: new Date(),
            noShowAt: null,
            canceledAt: null,
            cancelReason: null,
          },
        })
      }
      // Baixa financeira: cria Revenue do procedimento se ainda não houver uma
      // ligada a este appointment (idempotente no re-fechamento).
      const existing = await tx.revenue.findFirst({
        where: { appointmentId: lead.appointmentId!, deletedAt: null },
        select: { id: true },
      })
      if (!existing && lead.appointment!.procedureId && lead.appointment!.patientId) {
        const procedure = await tx.procedure.findFirst({
          where: { id: lead.appointment!.procedureId, organizationId: ctx.organizationId },
          select: { price: true, name: true },
        })
        if (procedure) {
          await tx.revenue.create({
            data: {
              organizationId: ctx.organizationId,
              clientId: lead.clientId,
              patientId: lead.appointment!.patientId,
              procedureId: lead.appointment!.procedureId,
              appointmentId: lead.appointmentId!,
              amount: procedure.price,
              date: new Date(),
              description: `Procedimento: ${procedure.name}`,
              createdById: ctx.userId,
            },
          })
        }
      }
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: params.stageId,
          ...(position !== undefined ? { position } : {}),
          closedAt: new Date(),
          updatedById: ctx.userId,
        },
      })
    })
    return { ok: true, moved: true }
  }

  // Demais etapas (LEAD, livres, RETENTION) → move simples, sem efeito.
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      stageId: params.stageId,
      ...(position !== undefined ? { position } : {}),
      updatedById: ctx.userId,
    },
  })
  return { ok: true, moved: true }
}

/**
 * 2d — Retrocesso confirmado: desfaz TODOS os efeitos cujo rank está acima da
 * etapa DESTINO (não só o da origem). Ex.: de CLOSED p/ LEAD desfaz baixa +
 * comparecimento + agendamento; de CLOSED p/ ATTENDED desfaz só a baixa.
 * Limiares (efeito "vive" enquanto rank do card > destRank):
 *   rank ≥ 3 (CLOSED)            → remove Revenue + limpa closedAt.
 *   rank ≥ 2 (ATTENDED/NO_SHOW)  → Appointment volta p/ SCHEDULED.
 *   rank ≥ 1 (SCHEDULED)         → soft-delete do Appointment + limpa vínculo.
 * Tudo em transação.
 */
export async function regressLeadStage(
  ctx: TenantContext,
  params: { clientId: string; leadId: string; stageId: string; position?: number }
): Promise<{ ok: boolean }> {
  const loaded = await loadMoveContext(ctx, params.clientId, params.leadId, params.stageId)
  if (!loaded) return { ok: false }
  const { lead, fromKey, destKey } = loaded

  const fromRank = fromKey ? (COMMERCIAL_RANK[fromKey] ?? 0) : 0
  // Destino sem rank (etapa livre) → trata como início da cadeia (desfaz tudo).
  const destRank = destKey ? (COMMERCIAL_RANK[destKey] ?? 0) : 0

  // Desfaz um efeito de rank `r` se o card o tinha (fromRank ≥ r) e o destino
  // está abaixo dele (destRank < r).
  const undo = (r: number) => fromRank >= r && destRank < r

  await scopedTransaction(async (tx) => {
    // CLOSED (rank 3): baixa financeira.
    if (undo(3)) {
      if (lead.appointmentId) {
        await tx.revenue.deleteMany({ where: { appointmentId: lead.appointmentId } })
      }
      await tx.lead.update({ where: { id: lead.id }, data: { closedAt: null } })
    }

    // ATTENDED/NO_SHOW/Cancelado (rank 2): comparecimento/cancelamento. Volta
    // agendamento p/ SCHEDULED limpando todas as marcas de desfecho.
    if (undo(2)) {
      if (lead.appointmentId) {
        await tx.appointment.update({
          where: { id: lead.appointmentId },
          data: {
            status: 'SCHEDULED',
            attendedAt: null,
            noShowAt: null,
            canceledAt: null,
            cancelReason: null,
          },
        })
      }
      await tx.lead.update({ where: { id: lead.id }, data: { attendedAt: null, lostAt: null } })
    }

    // SCHEDULED (rank 1): agendamento. Soft-delete + limpa vínculo.
    if (undo(1)) {
      if (lead.appointmentId) {
        await tx.appointment.update({
          where: { id: lead.appointmentId },
          data: { deletedAt: new Date() },
        })
      }
      await tx.lead.update({
        where: { id: lead.id },
        data: { appointmentId: null, scheduledAt: null },
      })
    }

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        stageId: params.stageId,
        ...(params.position !== undefined ? { position: params.position } : {}),
        updatedById: ctx.userId,
      },
    })

    await tx.leadInteraction.create({
      data: {
        leadId: lead.id,
        type: 'NOTE',
        content: `Card retrocedido de ${fromKey ?? 'etapa'} — efeitos desfeitos.`,
        createdById: ctx.userId,
      },
    })
  })

  return { ok: true }
}
