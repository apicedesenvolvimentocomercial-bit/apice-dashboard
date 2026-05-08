import { prisma } from '@/lib/prisma'
import type { TenantContext } from '@/server/tenant/context'

export async function createRevenueFromAppointment(
  ctx: TenantContext,
  clientId: string,
  appointmentId: string,
  patientId: string,
  procedureId: string
) {
  const procedure = await prisma.procedure.findFirst({
    where: { id: procedureId, organizationId: ctx.organizationId },
    select: { price: true, name: true },
  })
  if (!procedure) return null

  return prisma.revenue.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      patientId,
      procedureId,
      appointmentId,
      amount: procedure.price,
      date: new Date(),
      description: `Procedimento: ${procedure.name}`,
      createdById: ctx.userId,
    },
  })
}
