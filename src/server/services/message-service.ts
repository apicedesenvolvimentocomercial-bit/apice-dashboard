import type { MessageChannel } from '@prisma/client'

import { prisma } from '@/lib/prisma'

/**
 * Mensageria ao paciente — fundação para disparo real (reforma da retenção,
 * retencao-reforma-progresso.md). O ENQUEUE grava na fila `OutboundMessage`; o
 * `messages-job` (cron, cross-clínica) despacha pelo provider (hoje o
 * `WhatsappMockProvider`). Trocar a factory em `integrations/index.ts` pelo provider
 * real NÃO muda nada aqui.
 *
 * Escopo de RLS: usado HOJE só pelo `retention-job`/`messages-job` (cross-clínica,
 * contexto admin, GUC nula = exceção legítima, igual ao retention-job). Se algum dia
 * for chamado de um caminho de clínica, entrar escopo + clientId no where, como manda
 * o CLAUDE.md.
 */

export const RETENTION_TEMPLATE_KEYS = {
  POST_CARE: 'retention.post_care',
  NURTURE: 'retention.nurture',
  REACTIVATION: 'retention.reactivation',
  WINBACK: 'retention.winback',
} as const

// Templates default (pt-BR, tom de WhatsApp). Semeados por clínica em
// `ensureDefaultMessageTemplates` (editáveis depois). O `messages-job` cai neles
// quando a clínica não tem template próprio ativo.
export const DEFAULT_MESSAGE_TEMPLATES: Record<string, { title: string; body: string }> = {
  [RETENTION_TEMPLATE_KEYS.POST_CARE]: {
    title: 'Pós-procedimento',
    body: 'Olá {{nome}}! 💜 Esperamos que tenha gostado do seu {{procedimento}} aqui na {{clinica}}. Qualquer dúvida sobre os cuidados pós-procedimento, é só chamar. Cuide-se!',
  },
  [RETENTION_TEMPLATE_KEYS.NURTURE]: {
    title: 'Acompanhamento',
    body: 'Oi {{nome}}! Passando para saber como você está depois do {{procedimento}}. Lembre-se dos cuidados em casa — estamos à disposição para qualquer dúvida. 😊 — {{clinica}}',
  },
  [RETENTION_TEMPLATE_KEYS.REACTIVATION]: {
    title: 'Hora do retorno',
    body: '{{nome}}, sentimos sua falta! 🌸 Já faz um tempo desde o seu {{procedimento}}. Que tal agendar o seu retorno para manter o resultado? Temos uma condição especial para você. — {{clinica}}',
  },
  [RETENTION_TEMPLATE_KEYS.WINBACK]: {
    title: 'Sentimos sua falta',
    body: 'Oi {{nome}}, tudo bem? Faz um tempinho que não te vemos na {{clinica}}. Preparamos algo especial para te receber de volta. Vamos remarcar? 💛',
  },
}

/** Substitui placeholders {{chave}} no corpo do template. Chave ausente vira "". */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '')
}

/**
 * Resolve o template de uma chave: o da clínica (ativo) ou o default embutido.
 * Retorna `null` se a chave não tem default e a clínica não tem template.
 */
export async function resolveTemplate(
  clientId: string,
  key: string
): Promise<{ title: string | null; body: string } | null> {
  const tpl = await prisma.messageTemplate.findFirst({
    where: { clientId, key, isActive: true, deletedAt: null },
    select: { title: true, body: true },
  })
  if (tpl) return tpl
  const def = DEFAULT_MESSAGE_TEMPLATES[key]
  return def ? { title: def.title, body: def.body } : null
}

export type EnqueueMessageParams = {
  organizationId: string
  clientId: string
  patientId?: string | null
  channel?: MessageChannel
  templateKey: string
  /** Variáveis do template + destino. `to` é o telefone/contato resolvido. */
  vars: Record<string, string>
  to?: string | null
  scheduledFor?: Date
  /** Chave de idempotência (@unique). Reenfileirar com a mesma chave é no-op. */
  dedupeKey?: string
}

/**
 * Enfileira uma mensagem (status QUEUED). Idempotente por `dedupeKey`: o mesmo
 * disparo repetido pelo cron não duplica. Sem telefone/contato → grava SKIPPED
 * (registro de que a régua quis falar mas faltou contato).
 */
export async function enqueueMessage(params: EnqueueMessageParams): Promise<void> {
  const {
    organizationId,
    clientId,
    patientId = null,
    channel = 'WHATSAPP',
    templateKey,
    vars,
    to = null,
    scheduledFor = new Date(),
    dedupeKey,
  } = params

  const payload = { ...vars, to: to ?? '' }
  const status = to ? 'QUEUED' : 'SKIPPED'

  const data = {
    organizationId,
    clientId,
    patientId,
    channel,
    templateKey,
    payload,
    status: status as 'QUEUED' | 'SKIPPED',
    scheduledFor,
    dedupeKey: dedupeKey ?? null,
  }

  if (dedupeKey) {
    // Upsert no dedupeKey: cria se novo, no-op se já existe (idempotência).
    await prisma.outboundMessage.upsert({
      where: { dedupeKey },
      create: data,
      update: {},
    })
  } else {
    await prisma.outboundMessage.create({ data })
  }
}

/**
 * Semeia os templates default de retenção para uma clínica (idempotente). Chamado
 * pelo cron de retenção antes de enfileirar, para a clínica poder editá-los na UI.
 */
export async function ensureDefaultMessageTemplates(
  clientId: string,
  organizationId: string
): Promise<void> {
  const existing = await prisma.messageTemplate.findMany({
    where: { clientId },
    select: { key: true },
  })
  const have = new Set(existing.map((t) => t.key))

  const toCreate = Object.entries(DEFAULT_MESSAGE_TEMPLATES)
    .filter(([key]) => !have.has(key))
    .map(([key, t]) => ({
      organizationId,
      clientId,
      key,
      channel: 'WHATSAPP' as const,
      title: t.title,
      body: t.body,
    }))

  if (toCreate.length > 0) {
    await prisma.messageTemplate.createMany({ data: toCreate })
  }
}
