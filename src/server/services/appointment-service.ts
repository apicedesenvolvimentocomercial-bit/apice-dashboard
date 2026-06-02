import { prisma } from '@/lib/prisma'
import { buildPaidRevenueData } from '@/server/repositories/revenue-repository'
import type { TenantContext } from '@/server/tenant/context'

export async function createRevenueFromAppointment(
  ctx: TenantContext,
  clientId: string,
  appointmentId: string,
  patientId: string,
  procedureId: string
) {
  // Belt: appointment, procedimento e paciente precisam ser DESTA clínica. O
  // caller passa ids vindos da UI; sem validar, dava p/ anexar a receita a
  // registros de clínica-irmã da mesma org (a RLS cobre o WRITE da Revenue, mas
  // não valida os FKs apontados).
  const [appointment, procedure, patient] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id: appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    }),
    prisma.procedure.findFirst({
      where: { id: procedureId, clientId, organizationId: ctx.organizationId },
      select: { price: true, name: true, cost: true },
    }),
    prisma.patient.findFirst({
      where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    }),
  ])
  if (!appointment || !procedure || !patient) return null

  return prisma.revenue.create({
    data: buildPaidRevenueData({
      organizationId: ctx.organizationId,
      clientId,
      patientId,
      procedureId,
      appointmentId,
      amount: procedure.price,
      cost: Number(procedure.cost),
      date: new Date(),
      type: 'PROCEDIMENTO',
      description: `Procedimento: ${procedure.name}`,
      createdById: ctx.userId,
    }),
  })
}
