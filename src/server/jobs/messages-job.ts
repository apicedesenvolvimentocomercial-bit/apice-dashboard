import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getWhatsappProvider } from '@/server/integrations'
import { DEFAULT_MESSAGE_TEMPLATES, renderTemplate } from '@/server/services/message-service'
import {
  dispatchNotification,
  getRecipientsForClient,
} from '@/server/services/notification-service'

/**
 * Despacha a fila `OutboundMessage` (reforma da retenção + plano de correções 1.2).
 * Cross-clínica → roda em contexto admin (GUC nula = exceção legítima de RLS).
 *
 * Robustez (decisões E1/F):
 * - CLAIM atômico por linha: `updateMany({ where: { id, status: QUEUED } })` →
 *   só a execução que transicionou QUEUED→SENDING processa a mensagem. Execuções
 *   sobrepostas (cron + retrigger manual) NUNCA despacham a mesma mensagem 2×.
 * - RETRY com backoff exponencial: falha transitória volta p/ QUEUED com
 *   `nextAttemptAt` futuro; FAILED é terminal só após MAX_ATTEMPTS.
 * - RECOVERY: SENDING órfão (crash entre o claim e o resultado) além de
 *   STUCK_SENDING_MINUTES é re-enfileirado no início de cada execução.
 *
 * Hoje só WhatsApp tem provider; SMS/EMAIL ficam SKIPPED até existir adapter.
 */

export const MAX_ATTEMPTS = 5
export const STUCK_SENDING_MINUTES = 15

/** Backoff exponencial: 30min, 60min, 120min, 240min… (decisão F). */
export function backoffMinutes(attempt: number): number {
  return 30 * 2 ** (Math.max(1, attempt) - 1)
}

export async function runMessagesJob(now: Date = new Date(), batchSize = 200) {
  // Recovery de crash: claims órfãos voltam à fila (a tentativa já foi contada
  // no claim — crash consome uma tentativa, de propósito).
  const stuckBefore = new Date(now.getTime() - STUCK_SENDING_MINUTES * 60_000)
  const recovered = await prisma.outboundMessage.updateMany({
    where: { status: 'SENDING', updatedAt: { lt: stuckBefore } },
    data: { status: 'QUEUED' },
  })
  if (recovered.count > 0) {
    logger.warn('Messages job: mensagens SENDING órfãs re-enfileiradas', {
      count: recovered.count,
    })
  }

  const due = await prisma.outboundMessage.findMany({
    where: {
      status: 'QUEUED',
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledFor: 'asc' },
    take: batchSize,
    select: {
      id: true,
      clientId: true,
      organizationId: true,
      channel: true,
      templateKey: true,
      payload: true,
      attempts: true,
    },
  })

  let sent = 0
  let failed = 0
  let requeued = 0
  let skipped = 0
  let alreadyClaimed = 0

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

  // Falha transitória → re-fila com backoff; esgotou → FAILED terminal.
  async function handleFailure(
    msg: { id: string; clientId: string; organizationId: string; templateKey: string },
    attempt: number,
    errorMsg: string
  ) {
    const { id } = msg
    if (attempt >= MAX_ATTEMPTS) {
      await prisma.outboundMessage.update({
        where: { id },
        data: { status: 'FAILED', error: errorMsg, nextAttemptAt: null },
      })
      failed++
      logger.warn('Messages job: mensagem FAILED terminal', { id, attempt, error: errorMsg })
      // Titular fica sabendo que a régua deixou de alcançar alguém (best-effort).
      // Dedupe 20h por link ⇒ no máximo 1 aviso/dia mesmo com várias falhas.
      try {
        const targets = await getRecipientsForClient(msg.organizationId, msg.clientId)
        if (targets.length > 0) {
          await dispatchNotification(targets, {
            type: 'SYSTEM',
            title: 'Mensagem automática falhou',
            message:
              `Uma mensagem da régua (template "${msg.templateKey}") esgotou as tentativas ` +
              'de envio. Verifique a integração de WhatsApp e considere contatar o paciente à mão.',
            link: '/configuracoes',
            metadata: { outboundMessageId: id, templateKey: msg.templateKey },
            dedupeWindowHours: 20,
          })
        }
      } catch (notifyErr) {
        logger.warn('Messages job: aviso de FAILED não enviado', {
          id,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        })
      }
    } else {
      await prisma.outboundMessage.update({
        where: { id },
        data: {
          status: 'QUEUED',
          error: errorMsg,
          nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempt) * 60_000),
        },
      })
      requeued++
    }
  }

  for (const msg of due) {
    // CLAIM atômico (E1): só processa quem fez a transição QUEUED→SENDING.
    const claimed = await prisma.outboundMessage.updateMany({
      where: { id: msg.id, status: 'QUEUED' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    })
    if (claimed.count === 0) {
      alreadyClaimed++
      continue
    }
    const attempt = msg.attempts + 1

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
      if (res.status === 'failed') {
        await handleFailure(msg, attempt, 'provider recusou o envio')
      } else {
        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: 'SENT',
            externalId: res.externalId,
            sentAt: new Date(),
            error: null,
            nextAttemptAt: null,
          },
        })
        sent++
      }
    } catch (err) {
      await handleFailure(msg, attempt, err instanceof Error ? err.message : String(err))
    }
  }

  const summary = {
    picked: due.length,
    claimed: due.length - alreadyClaimed,
    sent,
    requeued,
    failed,
    skipped,
    recovered: recovered.count,
  }
  logger.info('Messages job finished', summary)
  return summary
}
