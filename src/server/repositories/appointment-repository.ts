import type { AppointmentStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type AppointmentForCalendar = Awaited<ReturnType<typeof listAppointments>>[number]
export type AppointmentFull = Awaited<ReturnType<typeof findAppointmentById>>

export async function listAppointments(
  ctx: TenantContext,
  clientId: string,
  filters?: { from?: Date; to?: Date; status?: AppointmentStatus },
  // Item 4: agenda pessoal. `null` = ver tudo (admin/titular/viewAll); userId =
  // só os agendamentos desse usuário (Appointment.assignedToId).
  ownerId: string | null = null
) {
  return prisma.appointment.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(ownerId ? { assignedToId: ownerId } : {}),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.from || filters?.to
        ? {
            scheduledAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      confirmedAt: true,
      attendedAt: true,
      noShowAt: true,
      canceledAt: true,
      cancelReason: true,
      notes: true,
      createdAt: true,
      patientId: true,
      procedureId: true,
      procedureIds: true,
      patient: {
        select: { id: true, name: true, phone: true },
      },
      procedure: {
        select: { id: true, name: true, durationMinutes: true },
      },
      // Card do CRM que gerou o agendamento (Fase 2). `deletedAt != null` =
      // Lead excluído → a agenda pisca um aviso (feat4). `id` alimenta o
      // retrocesso ao excluir o agendamento (feat2).
      lead: { select: { id: true, deletedAt: true } },
    },
  })
}

export async function findAppointmentById(
  ctx: TenantContext,
  clientId: string,
  appointmentId: string
) {
  return prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      confirmedAt: true,
      attendedAt: true,
      noShowAt: true,
      canceledAt: true,
      cancelReason: true,
      notes: true,
      createdAt: true,
      patientId: true,
      procedureId: true,
      procedureIds: true,
      patient: {
        select: { id: true, name: true, phone: true, email: true },
      },
      procedure: {
        select: { id: true, name: true, durationMinutes: true },
      },
    },
  })
}

export async function createAppointment(
  ctx: TenantContext,
  clientId: string,
  data: {
    patientId: string
    procedureIds: string[] // 1+; procedureIds[0] vira o procedimento PRINCIPAL
    scheduledAt: Date
    durationMinutes: number
    notes?: string
  }
) {
  return prisma.appointment.create({
    data: {
      patientId: data.patientId,
      procedureId: data.procedureIds[0],
      procedureIds: data.procedureIds,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
      organizationId: ctx.organizationId,
      clientId,
      status: 'SCHEDULED',
      createdById: ctx.userId,
      // Item 4: dono da agenda = criador por padrão (reatribuível).
      assignedToId: ctx.userId,
    },
  })
}

export async function updateAppointmentStatus(
  ctx: TenantContext,
  appointmentId: string,
  clientId: string,
  status: AppointmentStatus,
  extra?: { cancelReason?: string }
) {
  const timestamps: Partial<Record<string, Date | null>> = {
    ...(status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
    ...(status === 'ATTENDED' ? { attendedAt: new Date() } : {}),
    ...(status === 'NO_SHOW' ? { noShowAt: new Date() } : {}),
    ...(status === 'CANCELED' ? { canceledAt: new Date() } : {}),
  }

  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.appointment.updateMany({
    where: { id: appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: {
      status,
      ...timestamps,
      ...(extra?.cancelReason ? { cancelReason: extra.cancelReason } : {}),
    },
  })
}

export async function updateAppointment(
  ctx: TenantContext,
  appointmentId: string,
  clientId: string,
  data: Partial<{
    patientId: string
    procedureIds: string[]
    scheduledAt: Date
    durationMinutes: number
    notes: string
  }>
) {
  const { procedureIds, ...rest } = data
  return prisma.appointment.updateMany({
    where: { id: appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    // Ao trocar os procedimentos, mantém o escalar principal = procedureIds[0].
    data: {
      ...rest,
      ...(procedureIds && procedureIds.length
        ? { procedureIds, procedureId: procedureIds[0] }
        : {}),
    },
  })
}

export async function softDeleteAppointment(
  ctx: TenantContext,
  appointmentId: string,
  clientId: string
) {
  return prisma.appointment.updateMany({
    where: { id: appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
