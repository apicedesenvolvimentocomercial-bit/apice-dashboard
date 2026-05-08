import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export type PatientWithStats = Awaited<ReturnType<typeof listPatients>>[number]
export type PatientFull = Awaited<ReturnType<typeof findPatientById>>

export async function listPatients(
  ctx: TenantContext,
  clientId: string,
  filters?: { search?: string }
) {
  return prisma.patient.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId,
      deletedAt: null,
      ...(filters?.search && {
        name: { contains: filters.search, mode: 'insensitive' },
      }),
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      tags: true,
      firstVisitAt: true,
      lastVisitAt: true,
      createdAt: true,
      _count: {
        select: {
          appointments: { where: { deletedAt: null } },
        },
      },
    },
  })
}

export async function findPatientById(ctx: TenantContext, patientId: string) {
  return prisma.patient.findFirst({
    where: {
      id: patientId,
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
  return prisma.patient.updateMany({
    where: { id: patientId, organizationId: ctx.organizationId, deletedAt: null },
    data,
  })
}

export async function softDeletePatient(ctx: TenantContext, patientId: string) {
  return prisma.patient.updateMany({
    where: { id: patientId, organizationId: ctx.organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}
