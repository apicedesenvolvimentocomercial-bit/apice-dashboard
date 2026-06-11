import { toZonedTime } from 'date-fns-tz'

import { APP_TIMEZONE, monthBoundsFor, spDate, spDayKey } from '@/lib/date'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  APPOINTMENT_TEMPLATE_KEYS,
  enqueueMessage,
  ensureDefaultMessageTemplates,
  renderTemplate,
  resolveTemplate,
} from '@/server/services/message-service'

/**
 * LEMBRETE DE AGENDAMENTO (P0.1 — auditoria-produto). Cron diário (09:00 SP):
 * para cada Appointment SCHEDULED/CONFIRMED de AMANHÃ (dia-calendário SP), o
 * paciente recebe o toque de confirmação.
 *
 * Provider-agnostic DE PROPÓSITO: o job só ENFILEIRA na `OutboundMessage` (ou
 * vira tarefa) — quem despacha é o `messages-job` pelo provider da factory
 * (hoje `WhatsappMockProvider`; quando o WhatsApp real entrar, NADA muda aqui).
 *
 * - `operationMode=AUTOMATED` + WhatsApp ligado → enfileira mensagem.
 * - MANUAL (ou WhatsApp off) → cria Activity (type MESSAGE) atrelada ao
 *   paciente com o texto sugerido + grava linha TASK no ledger (idempotência).
 * - Idempotente: dedupeKey `apt-rem:{appointmentId}:{diaSP do agendamento}` —
 *   re-rodar não duplica; REMARCAR p/ outro dia gera lembrete novo (correto).
 *
 * Cross-clínica → contexto admin (GUC nula), exceção legítima de RLS (igual
 * retention-job/messages-job).
 */

type JobTotals = { queued: number; tasked: number; skipped: number; errors: number }

export async function runAppointmentRemindersJob(now: Date = new Date()): Promise<JobTotals> {
  const totals: JobTotals = { queued: 0, tasked: 0, skipped: 0, errors: 0 }
  const whatsappEnabled = env.WHATSAPP_API_ENABLED

  // Janela = AMANHÃ no calendário de SP (dia inteiro).
  const b = monthBoundsFor(now)
  const tomorrowStart = spDate(b.year, b.month0, b.day + 1, 0, 0, 0)
  const dayAfterStart = spDate(b.year, b.month0, b.day + 2, 0, 0, 0)

  const appointments = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: { gte: tomorrowStart, lt: dayAfterStart },
      client: { deletedAt: null, status: { not: 'INACTIVE' } },
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      scheduledAt: true,
      patient: { select: { id: true, name: true, phone: true } },
      procedure: { select: { name: true } },
      client: { select: { name: true, operationMode: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
  if (appointments.length === 0) return totals

  // Idempotência em lote: 1 query pelo ledger em vez de 1 por appointment.
  const dedupeKeys = appointments.map((a) => `apt-rem:${a.id}:${spDayKey(a.scheduledAt)}`)
  const existing = new Set(
    (
      await prisma.outboundMessage.findMany({
        where: { dedupeKey: { in: dedupeKeys } },
        select: { dedupeKey: true },
      })
    ).map((m) => m.dedupeKey!)
  )

  // Garante o template default por clínica (cria só o que falta; barato).
  const clientIds = [...new Set(appointments.map((a) => a.clientId))]
  await Promise.all(
    clientIds.map((id) => {
      const orgId = appointments.find((a) => a.clientId === id)!.organizationId
      return ensureDefaultMessageTemplates(id, orgId)
    })
  )

  for (const apt of appointments) {
    const dedupeKey = `apt-rem:${apt.id}:${spDayKey(apt.scheduledAt)}`
    if (existing.has(dedupeKey)) {
      totals.skipped++
      continue
    }

    try {
      const zoned = toZonedTime(apt.scheduledAt, APP_TIMEZONE)
      const vars = {
        nome: apt.patient.name.split(' ')[0] ?? apt.patient.name,
        procedimento: apt.procedure.name,
        clinica: apt.client.name,
        data: `${String(zoned.getDate()).padStart(2, '0')}/${String(zoned.getMonth() + 1).padStart(2, '0')}`,
        hora: `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`,
      }

      const automate = apt.client.operationMode === 'AUTOMATED' && whatsappEnabled
      if (automate) {
        await enqueueMessage({
          organizationId: apt.organizationId,
          clientId: apt.clientId,
          patientId: apt.patient.id,
          templateKey: APPOINTMENT_TEMPLATE_KEYS.REMINDER,
          to: apt.patient.phone,
          vars,
          dedupeKey,
        })
        totals.queued++
      } else {
        // Modo MANUAL: tarefa atrelada ao paciente com a mensagem sugerida —
        // mesmo padrão da régua de retenção (createRetentionTask).
        const tpl = await resolveTemplate(apt.clientId, APPOINTMENT_TEMPLATE_KEYS.REMINDER)
        const body = tpl ? renderTemplate(tpl.body, vars) : ''
        const description =
          (body ? body + '\n\n' : '') +
          (apt.patient.phone
            ? `Contato: ${apt.patient.phone}`
            : 'Paciente sem telefone cadastrado.')

        await prisma.activity.create({
          data: {
            organizationId: apt.organizationId,
            clientId: apt.clientId,
            domain: 'CLINIC',
            type: 'MESSAGE',
            title: `Confirmar agendamento: ${vars.nome} amanhã às ${vars.hora}`,
            description,
            status: 'PENDING',
            priority: 'MEDIUM',
            patientId: apt.patient.id,
            dueDate: new Date(),
          },
        })
        await prisma.outboundMessage.create({
          data: {
            organizationId: apt.organizationId,
            clientId: apt.clientId,
            patientId: apt.patient.id,
            channel: 'WHATSAPP',
            templateKey: APPOINTMENT_TEMPLATE_KEYS.REMINDER,
            payload: { ...vars, to: apt.patient.phone ?? '' },
            status: 'TASK',
            dedupeKey,
          },
        })
        totals.tasked++
      }
    } catch (err) {
      totals.errors++
      logger.error('appointment reminder failed', {
        appointmentId: apt.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('Appointment reminders job complete', totals)
  return totals
}
