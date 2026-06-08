import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getWhatsappProvider } from '@/server/integrations'
import { DEFAULT_MESSAGE_TEMPLATES, renderTemplate } from '@/server/services/message-service'

/**
 * Despacha a fila `OutboundMessage` (reforma da retenção). Cross-clínica → roda em
 * contexto admin (GUC nula = exceção legítima de RLS, igual ao retention-job). Pega
 * QUEUED com `scheduledFor <= now`, resolve o template (da clínica ou o default),
 * envia pelo provider (hoje MOCK) e grava SENT/FAILED + externalId.
 *
 * Hoje só WhatsApp tem provider; SMS/EMAIL ficam SKIPPED até existir adapter.
 */
export async function runMessagesJob(now: Date = new Date(), batchSize = 200) {
  const due = await prisma.outboundMessage.findMany({
    where: { status: 'QUEUED', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: batchSize,
    select: {
      id: true,
      clientId: true,
      channel: true,
      templateKey: true,
      payload: true,
    },
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  // Cache de templates por clínica p/ não consultar por mensagem.
  const templateCache = new Map<string, { title: string | null; body: string } | null>()

  async function resolveTemplate(clientId: string, key: string) {
    const cacheKey = `${clientId}:${key}`
    if (templateCache.has(cacheKey)) return templateCache.get(cacheKey)!
    const tpl = await prisma.messageTemplate.findFirst({
      where: { clientId, key, isActive: true, deletedAt: null },
      select: { title: true, body: true },
    })
    const resolved = tpl ?? DEFAULT_MESSAGE_TEMPLATES[key] ?? null
    templateCache.set(cacheKey, resolved)
    return resolved
  }

  for (const msg of due) {
    const vars = (msg.payload ?? {}) as Record<string, string>
    const to = vars.to

    // Só WhatsApp tem provider real/mock hoje; demais canais ficam SKIPPED.
    if (msg.channel !== 'WHATSAPP' || !to) {
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: 'SKIPPED', error: !to ? 'sem contato' : 'canal sem provider' },
      })
      skipped++
      continue
    }

    const tpl = await resolveTemplate(msg.clientId, msg.templateKey)
    if (!tpl) {
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: 'SKIPPED', error: 'template ausente' },
      })
      skipped++
      continue
    }

    try {
      const body = renderTemplate(tpl.body, vars)
      const res = await getWhatsappProvider().sendMessage({
        to,
        template: msg.templateKey,
        variables: { ...vars, body },
      })
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: {
          status: res.status === 'failed' ? 'FAILED' : 'SENT',
          externalId: res.externalId,
          sentAt: new Date(),
        },
      })
      if (res.status === 'failed') failed++
      else sent++
    } catch (err) {
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
      })
      failed++
    }
  }

  logger.info('Messages job finished', { picked: due.length, sent, failed, skipped })
  return { picked: due.length, sent, failed, skipped }
}
