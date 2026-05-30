'use server'

import type { AppointmentStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { isTooOldToSchedule, parseScheduledAt } from '@/lib/date'
import { ok, fail, NotFoundError } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import {
  listAppointments,
  findAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  softDeleteAppointment,
} from '@/server/repositories/appointment-repository'
import { createRevenueFromAppointment } from '@/server/services/appointment-service'
import {
  regressAppointmentToLead,
  syncPipelineCardForManualAppointment,
  attendAppointment,
  cancelAppointmentSync,
  closeAppointmentCard,
  syncLeadScheduledAt,
} from '@/server/services/pipeline-stage-effects'
import { logger } from '@/lib/logger'

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Paciente obrigatório'),
  procedureId: z.string().min(1, 'Procedimento obrigatório'),
  scheduledAt: z.string().min(1, 'Data obrigatória'),
  durationMinutes: z.number().int().positive(),
  notes: z.string().optional(),
})

function rejectIfTooOld(scheduledAt: Date): { ok: true } | { ok: false; message: string } {
  if (isTooOldToSchedule(scheduledAt)) {
    return {
      ok: false,
      message: 'Data inválida: não é possível agendar mais de 1 ano no passado',
    }
  }
  return { ok: true }
}

function revalidate(clientId: string) {
  revalidatePath('/appointments')
  revalidatePath('/patients')
  revalidatePath(`/clients/${clientId}/appointments`)
  revalidatePath(`/clients/${clientId}/patients`)
}

// Quando o efeito da agenda espelha um card no funil, o CRM também precisa
// revalidar para refletir o card movido.
function revalidateCrm(clientId: string) {
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
}

// feat agenda→pipeline: Compareceu pela agenda completa o cadastro (os 5 campos
// obrigatórios), igual ao fluxo da pipeline.
const attendSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().min(1, 'Telefone obrigatório'),
  email: z.string().email('E-mail inválido'),
  birthDate: z.string().min(1, 'Data de nascimento obrigatória'),
  cpf: z.string().min(1, 'CPF obrigatório'),
})

export async function getAppointmentsAction(
  clientId: string,
  filters?: { from?: string; to?: string }
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica nesta action
  await assertCan(ctx, 'appointments', 'read')

  const appointments = await listAppointments(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
  })
  return ok(appointments)
}

export async function getAppointmentAction(appointmentId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'read')

  const appointment = await findAppointmentById(ctx, clientId, appointmentId)
  if (!appointment) return fail(new NotFoundError('Agendamento'))
  return ok(appointment)
}

export async function createAppointmentAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = appointmentSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt)
  const dateCheck = rejectIfTooOld(scheduledAt)
  if (!dateCheck.ok) return fail(dateCheck.message)

  const appointment = await createAppointment(ctx, clientId, {
    ...parsed.data,
    scheduledAt,
  })

  // Visão (agenda→pipeline): espelha o agendamento manual num card da pipeline.
  // Best-effort: não bloqueia o agendamento se o sync falhar.
  try {
    await syncPipelineCardForManualAppointment(ctx, {
      clientId,
      patientId: parsed.data.patientId,
      appointmentId: appointment.id,
      scheduledAt,
    })
  } catch (err) {
    logger.error('syncPipelineCardForManualAppointment failed', {
      error: err instanceof Error ? err.message : String(err),
      appointmentId: appointment.id,
    })
  }

  revalidate(clientId)
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
  return ok(appointment)
}

export async function updateAppointmentAction(
  appointmentId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = appointmentSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  let scheduledAt: Date | undefined
  if (parsed.data.scheduledAt) {
    scheduledAt = parseScheduledAt(parsed.data.scheduledAt)
    const dateCheck = rejectIfTooOld(scheduledAt)
    if (!dateCheck.ok) return fail(dateCheck.message)
  }

  await updateAppointment(ctx, appointmentId, clientId, {
    ...parsed.data,
    scheduledAt,
  })

  // Visão (agenda→pipeline): remarcar propaga a nova data ao card ligado.
  // Best-effort: não bloqueia a remarcação se o sync falhar.
  if (scheduledAt) {
    try {
      await syncLeadScheduledAt(ctx, { clientId, appointmentId, scheduledAt })
    } catch (err) {
      logger.error('syncLeadScheduledAt failed', {
        error: err instanceof Error ? err.message : String(err),
        appointmentId,
      })
    }
  }

  revalidate(clientId)
  revalidateCrm(clientId)
  return ok(null)
}

/**
 * Compareceu pela AGENDA — completa o cadastro do paciente (5 campos) e marca o
 * Appointment ATTENDED; se houver card comercial ligado, move-o para Compareceu.
 * Espelha o fluxo da pipeline (`attendLeadWithPatientData`). Ver `attendAppointment`.
 */
export async function attendAppointmentAction(
  appointmentId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'write')
  await assertCan(ctx, 'patients', 'write')

  const parsed = attendSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const res = await attendAppointment(ctx, {
    clientId,
    appointmentId,
    patient: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      birthDate: new Date(parsed.data.birthDate),
      cpf: parsed.data.cpf,
    },
  })
  if (!res.ok) return fail(new NotFoundError('Agendamento'))

  revalidate(clientId)
  revalidateCrm(clientId)
  return ok({ hadLead: res.hadLead })
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  clientId: string,
  status: AppointmentStatus,
  extra?: { cancelReason?: string }
) {
  try {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'appointments', 'write')

    // Faltou/Cancelado também espelham o card no funil (etapa Cancelado +
    // motivo). Faltou sem motivo explícito recebe um motivo padrão. Demais
    // status (Confirmado/Reagendado/Agendado) não movem card → update simples.
    // ATTENDED tem fluxo próprio (`attendAppointmentAction`) que exige os 5
    // campos do paciente — não deve cair aqui.
    if (status === 'NO_SHOW' || status === 'CANCELED') {
      const reason = extra?.cancelReason?.trim() || (status === 'NO_SHOW' ? 'Faltou' : 'Cancelado')
      await cancelAppointmentSync(ctx, { clientId, appointmentId, status, cancelReason: reason })
      revalidate(clientId)
      revalidateCrm(clientId)
      return ok(null)
    }

    await updateAppointmentStatus(ctx, appointmentId, clientId, status, extra)
    revalidate(clientId)
    return ok(null)
  } catch {
    return fail('Erro ao atualizar status')
  }
}

export async function confirmRevenueFromAppointmentAction(
  appointmentId: string,
  clientId: string,
  patientId: string,
  procedureId: string
) {
  try {
    const ctx = await getTenantContext()
    await assertClientAccess(ctx, clientId)
    enterClientScope(clientId)
    await assertCan(ctx, 'financial', 'write')

    const revenue = await createRevenueFromAppointment(
      ctx,
      clientId,
      appointmentId,
      patientId,
      procedureId
    )
    if (!revenue) return fail(new NotFoundError('Procedimento'))

    // Visão (agenda→pipeline): a baixa financeira fecha o card comercial ligado
    // (move p/ Fechado + seta closedAt = marcador de conversão). Best-effort:
    // não falha a baixa se o sync do card falhar.
    try {
      await closeAppointmentCard(ctx, { clientId, appointmentId })
    } catch (err) {
      logger.error('closeAppointmentCard failed', {
        error: err instanceof Error ? err.message : String(err),
        appointmentId,
      })
    }

    revalidate(clientId)
    revalidateCrm(clientId)
    return ok(null)
  } catch {
    return fail('Erro ao registrar receita')
  }
}

export async function deleteAppointmentAction(appointmentId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'delete')

  await softDeleteAppointment(ctx, appointmentId, clientId)
  revalidate(clientId)
  return ok(null)
}

/**
 * feat2 — Exclui um agendamento que veio da pipeline RETROCEDENDO o card ao
 * início (etapa LEAD), desfazendo seus efeitos (ver `regressAppointmentToLead`).
 * Sem card ligado, vira um soft-delete normal do agendamento.
 */
export async function regressAppointmentToLeadAction(appointmentId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'appointments', 'delete')

  const res = await regressAppointmentToLead(ctx, { clientId, appointmentId })
  if (!res.ok) return fail('Erro ao retroceder o agendamento')
  // Sem lead ligado: o regress não tocou nada → exclusão normal.
  if (!res.hadLead) {
    await softDeleteAppointment(ctx, appointmentId, clientId)
  }
  revalidate(clientId)
  revalidatePath('/crm')
  revalidatePath(`/clients/${clientId}/crm`)
  return ok(null)
}
