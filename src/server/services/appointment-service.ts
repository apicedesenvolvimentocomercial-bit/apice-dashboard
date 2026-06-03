import { parseLocalDate } from '@/lib/date'
import { prisma } from '@/lib/prisma'
import type { RevenueDetails } from '@/modules/financial/types'
import {
  aggregateProcedureRevenue,
  buildAppointmentRevenueData,
  buildPaidRevenueData,
} from '@/server/repositories/revenue-repository'
import type { TenantContext } from '@/server/tenant/context'

export async function createRevenueFromAppointment(
  ctx: TenantContext,
  clientId: string,
  appointmentId: string,
  patientId: string,
  // Procedimento principal (compat). Os procedimentos efetivos são lidos do
  // próprio agendamento (`procedureIds`) p/ somar combos.
  procedureId: string,
  // Detalhes de pagamento (forma, parcelas, desconto, data). Ausente = baixa simples
  // 1x quitada (compat). Presente = mesmo nível do registro manual.
  details?: RevenueDetails
) {
  // Belt: appointment e paciente precisam ser DESTA clínica. O caller passa ids
  // vindos da UI; sem validar, dava p/ anexar a receita a registros de
  // clínica-irmã da mesma org (a RLS cobre o WRITE da Revenue, mas não valida os
  // FKs apontados).
  const [appointment, patient] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id: appointmentId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, procedureId: true, procedureIds: true },
    }),
    prisma.patient.findFirst({
      where: { id: patientId, clientId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    }),
  ])
  if (!appointment || !patient) return null

  // Procedimentos do agendamento (combos): soma preço/custo numa baixa só.
  const ids = appointment.procedureIds.length
    ? appointment.procedureIds
    : [appointment.procedureId ?? procedureId]
  const rows = await prisma.procedure.findMany({
    where: { id: { in: ids }, clientId, organizationId: ctx.organizationId },
    select: { id: true, name: true, price: true, cost: true },
  })
  const agg = aggregateProcedureRevenue(
    ids,
    rows.map((r) => ({ id: r.id, name: r.name, price: Number(r.price), cost: Number(r.cost) }))
  )
  if (!agg) return null

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
        procedureId: agg.primaryId,
        appointmentId,
        procedureName: agg.name,
        price: agg.price,
        cost: agg.cost,
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
        procedureId: agg.primaryId,
        appointmentId,
        amount: agg.price,
        cost: agg.cost,
        date,
        type: 'PROCEDIMENTO',
        description: `Procedimento: ${agg.name}`,
        createdById: ctx.userId,
      })

  return prisma.revenue.create({ data })
}
