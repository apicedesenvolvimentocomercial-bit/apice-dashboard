'use server'

import type { AppointmentStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ok, fail, NotFoundError } from '@/types/errors'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import {
  listAppointments,
  findAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  softDeleteAppointment,
} from '@/server/repositories/appointment-repository'
import { createRevenueFromAppointment } from '@/server/services/appointment-service'

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Paciente obrigatório'),
  procedureId: z.string().min(1, 'Procedimento obrigatório'),
  scheduledAt: z.string().min(1, 'Data obrigatória'),
  durationMinutes: z.number().int().positive(),
  notes: z.string().optional(),
})

/**
 * Data mínima permitida para `scheduledAt`: exatamente 1 ano atrás a partir
 * de "agora". Bloqueia retroativos antigos (lançamentos contábeis de períodos
 * fechados) tanto no create quanto no update.
 */
function minAllowedScheduledAt(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() - 1)
  return d
}

function rejectIfTooOld(scheduledAt: Date): { ok: true } | { ok: false; message: string } {
  if (scheduledAt.getTime() < minAllowedScheduledAt().getTime()) {
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

export async function getAppointmentsAction(
  clientId: string,
  filters?: { from?: string; to?: string }
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'read')

  const appointments = await listAppointments(ctx, clientId, {
    from: filters?.from ? new Date(filters.from) : undefined,
    to: filters?.to ? new Date(filters.to) : undefined,
  })
  return ok(appointments)
}

export async function getAppointmentAction(appointmentId: string) {
  const ctx = await getTenantContext()
  await assertCan(ctx, 'appointments', 'read')

  const appointment = await findAppointmentById(ctx, appointmentId)
  if (!appointment) return fail(new NotFoundError('Agendamento'))
  return ok(appointment)
}

export async function createAppointmentAction(clientId: string, formData: unknown) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = appointmentSchema.safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos: ' + parsed.error.issues[0]?.message)

  const scheduledAt = new Date(parsed.data.scheduledAt)
  const dateCheck = rejectIfTooOld(scheduledAt)
  if (!dateCheck.ok) return fail(dateCheck.message)

  const appointment = await createAppointment(ctx, clientId, {
    ...parsed.data,
    scheduledAt,
  })
  revalidate(clientId)
  return ok(appointment)
}

export async function updateAppointmentAction(
  appointmentId: string,
  clientId: string,
  formData: unknown
) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'write')

  const parsed = appointmentSchema.partial().safeParse(formData)
  if (!parsed.success) return fail('Dados inválidos')

  let scheduledAt: Date | undefined
  if (parsed.data.scheduledAt) {
    scheduledAt = new Date(parsed.data.scheduledAt)
    const dateCheck = rejectIfTooOld(scheduledAt)
    if (!dateCheck.ok) return fail(dateCheck.message)
  }

  await updateAppointment(ctx, appointmentId, {
    ...parsed.data,
    scheduledAt,
  })
  revalidate(clientId)
  return ok(null)
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
    await assertCan(ctx, 'appointments', 'write')

    await updateAppointmentStatus(ctx, appointmentId, status, extra)
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
    await assertCan(ctx, 'financial', 'write')

    const revenue = await createRevenueFromAppointment(
      ctx,
      clientId,
      appointmentId,
      patientId,
      procedureId
    )
    if (!revenue) return fail(new NotFoundError('Procedimento'))
    revalidate(clientId)
    return ok(null)
  } catch {
    return fail('Erro ao registrar receita')
  }
}

export async function deleteAppointmentAction(appointmentId: string, clientId: string) {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'appointments', 'delete')

  await softDeleteAppointment(ctx, appointmentId)
  revalidate(clientId)
  return ok(null)
}
