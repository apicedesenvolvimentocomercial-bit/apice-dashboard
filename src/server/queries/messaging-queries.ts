import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { enterClientScope } from '@/server/tenant/client-scope'
import { ensureDefaultMessageTemplates } from '@/server/services/message-service'

export type MessageTemplateRow = {
  id: string
  key: string
  title: string | null
  body: string
  isActive: boolean
}

export type OutboundMessageRow = {
  id: string
  templateKey: string
  status: string
  scheduledFor: Date
  sentAt: Date | null
  error: string | null
  patientName: string | null
}

/**
 * Templates de mensagem (semeia os defaults se faltarem) + as últimas mensagens da
 * fila, para a clínica configurar a régua de retenção. Gateado por `settings:read`.
 */
export async function getClinicMessaging(clientId: string): Promise<{
  templates: MessageTemplateRow[]
  recent: OutboundMessageRow[]
}> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId) // suspenders: ativa a RLS p/ esta clínica
  await assertCan(ctx, 'settings', 'read')

  await ensureDefaultMessageTemplates(clientId, ctx.organizationId)

  const [templates, recent] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { key: 'asc' },
      select: { id: true, key: true, title: true, body: true, isActive: true },
    }),
    prisma.outboundMessage.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        templateKey: true,
        status: true,
        scheduledFor: true,
        sentAt: true,
        error: true,
        patient: { select: { name: true } },
      },
    }),
  ])

  return {
    templates,
    recent: recent.map((m) => ({
      id: m.id,
      templateKey: m.templateKey,
      status: m.status,
      scheduledFor: m.scheduledFor,
      sentAt: m.sentAt,
      error: m.error,
      patientName: m.patient?.name ?? null,
    })),
  }
}
