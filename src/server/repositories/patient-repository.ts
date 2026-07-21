import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PatientWithStats = Awaited<ReturnType<typeof listPatients>>[number]
export type PatientFull = Awaited<ReturnType<typeof findPatientById>>

export async function listPatients(
  ctx: TenantContext,
  clientId: string,
  filters?: { search?: string; onlyCompleted?: boolean }
) {
  return prisma.patient.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.search && {
        name: { contains: filters.search, mode: 'insensitive' },
      }),
      // "Pacientes reais": exclui fantasmas de agendamento (criados ao agendar e
      // que nunca compareceram). Mostra quem foi cadastrado manualmente/ganho
      // (fromScheduledLead=false) OU já teve ≥1 comparecimento (Appointment ATTENDED).
      ...(filters?.onlyCompleted && {
        OR: [
          { fromScheduledLead: false },
          { appointments: { some: { status: 'ATTENDED', deletedAt: null } } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      // cpf/notes: o lápis de editar da lista abre o EditPatientDialog direto com
      // a linha — sem eles o form nasceria incompleto e o save apagaria os dados.
      cpf: true,
      notes: true,
      tags: true,
      firstVisitAt: true,
      lastVisitAt: true,
      createdAt: true,
      // Distingue paciente "real" de lead provisório (criado ao agendar e que
      // nunca compareceu) — usado no rótulo "Paciente / Lead" dos selects.
      fromScheduledLead: true,
      _count: {
        select: {
          appointments: { where: { deletedAt: null } },
        },
      },
    },
  })
}

/**
 * Busca rápida do topbar (redesign): até 6 pacientes por nome (insensitive)
 * OU telefone (substring como digitada). Query vazia = recentes (última
 * visita primeiro, nulls por último). Payload mínimo p/ o popover.
 */
export async function quickSearchPatients(ctx: TenantContext, clientId: string, query: string) {
  return prisma.patient.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(query && {
        OR: [{ name: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }],
      }),
    },
    orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 6,
    select: {
      id: true,
      name: true,
      phone: true,
      lastVisitAt: true,
      fromScheduledLead: true,
    },
  })
}

export async function findPatientById(ctx: TenantContext, clientId: string, patientId: string) {
  return prisma.patient.findFirst({
    where: {
      id: patientId,
      clientId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      cpf: true,
      notes: true,
      tags: true,
      firstVisitAt: true,
      lastVisitAt: true,
      createdAt: true,
      appointments: {
        where: { deletedAt: null },
        orderBy: { scheduledAt: 'desc' },
        take: 10,
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          durationMinutes: true,
          procedure: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: {
          appointments: { where: { deletedAt: null } },
        },
      },
    },
  })
}

export async function createPatient(
  ctx: TenantContext,
  clientId: string,
  data: {
    name: string
    phone?: string
    email?: string
    birthDate?: Date
    cpf?: string
    notes?: string
    tags?: string[]
  }
) {
  return prisma.patient.create({
    data: {
      ...data,
      organizationId: ctx.organizationId,
      clientId,
      tags: data.tags ?? [],
      firstVisitAt: new Date(),
    },
  })
}

export async function updatePatient(
  ctx: TenantContext,
  patientId: string,
  clientId: string,
  data: Partial<{
    name: string
    phone: string
    email: string
    birthDate: Date
    cpf: string
    notes: string
    tags: string[]
    lastVisitAt: Date
  }>
) {
  // clientId no where (belt): isola entre clínicas da mesma org sem depender da RLS.
  return prisma.patient.updateMany({
    where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeletePatient(ctx: TenantContext, patientId: string, clientId: string) {
  return prisma.patient.updateMany({
    where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
