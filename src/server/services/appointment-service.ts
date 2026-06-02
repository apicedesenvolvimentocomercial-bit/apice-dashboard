import { parseLocalDate } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import type { RevenueDetails } from '@/modules/financial/types'
import {
  buildAppointmentRevenueData,
  buildPaidRevenueData,
} from '@/server/repositories/revenue-repository'
import type { TenantContext } from '@/server/tenant/context'

export async function createRevenueFromAppointment(
  ctx: TenantContext,
  clientId: string,
  appointmentId: string,
  patientId: string,
  procedureId: string,
  // Detalhes de pagamento (forma, parcelas, desconto, data). Ausente = baixa simples
  // 1x quitada (compat). Presente = mesmo nível do registro manual.
  details?: RevenueDetails
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

  // Idempotência: não duplica a baixa do mesmo agendamento (clientId no where = belt).
  const existing = await prisma.revenue.findFirst({
    where: { appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true },
  })
  if (existing) return existing

  const date = (details?.date ? parseLocalDate(details.date) : null) ?? new Date()

  const data = details
    ? buildAppointmentRevenueData({
        organizationId: ctx.organizationId,
        clientId,
        patientId,
        procedureId,
        appointmentId,
        procedureName: procedure.name,
        price: Number(procedure.price),
        cost: Number(procedure.cost),
        date,
        paymentMethod: details.paymentMethod ?? undefined,
        installments: details.installments,
        discountPct: details.discountPct,
        createdById: ctx.userId,
      })
    : buildPaidRevenueData({
        organizationId: ctx.organizationId,
        clientId,
        patientId,
        procedureId,
        appointmentId,
        amount: Number(procedure.price),
        cost: Number(procedure.cost),
        date,
        type: 'PROCEDIMENTO',
        description: `Procedimento: ${procedure.name}`,
        createdById: ctx.userId,
      })

  return prisma.revenue.create({ data })
}
