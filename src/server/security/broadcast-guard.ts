import 'server-only'

import { ValidationError } from '@/types/errors'

/**
 * Guarda anti-AMPLIFICAÇÃO de fan-out (broadcast). Um payload individual pode
 * respeitar o `bodySizeLimit` (150kb) e os `.max()` do zod e ainda assim virar
 * DoS de escrita: uma action que REPLICA o texto para N destinatários grava
 * `bytes × N` no banco (ex.: notificação com motivo/descrição do usuário para
 * todos os titulares + staff da clínica). Aqui o orçamento é do TOTAL.
 *
 * Puro (sem DB) — mede e decide. Enforcement no chokepoint de difusão
 * (`dispatchNotification`), então todo caller atual e futuro herda o teto sem
 * código extra. `assertBroadcastBudget` lança `ValidationError`: em action vira
 * `fail()` amigável via `runAction`; em cron vira retry+alerta do Inngest (um
 * cron estourar o orçamento É patológico e deve alertar).
 */

/** Máximo de destinatários numa única difusão. */
export const MAX_BROADCAST_RECIPIENTS = 200

/** Orçamento TOTAL de bytes de uma difusão (payload × destinatários). */
export const MAX_BROADCAST_TOTAL_BYTES = 512 * 1024

export type BroadcastBudgetResult = {
  allowed: boolean
  recipients: number
  /** Bytes de UMA cópia do payload (UTF-8; objetos medidos via JSON). */
  payloadBytes: number
  /** `payloadBytes × recipients` — o custo real de escrita da difusão. */
  totalBytes: number
  /** Motivo da negação (ausente quando `allowed`). */
  reason?: 'too-many-recipients' | 'budget-exceeded'
}

/**
 * Soma os bytes UTF-8 das partes do payload que serão replicadas por
 * destinatário. `null`/`undefined` não contam; não-string entra por
 * `JSON.stringify` (metadata JSON também é gravada N vezes).
 */
export function measurePayloadBytes(parts: ReadonlyArray<unknown>): number {
  let bytes = 0
  for (const part of parts) {
    if (part == null) continue
    bytes += Buffer.byteLength(typeof part === 'string' ? part : JSON.stringify(part), 'utf8')
  }
  return bytes
}

/** Decide se a difusão cabe no orçamento, sem lançar. */
export function checkBroadcastBudget(
  recipientCount: number,
  payloadParts: ReadonlyArray<unknown>,
  opts?: { maxRecipients?: number; maxTotalBytes?: number }
): BroadcastBudgetResult {
  const maxRecipients = opts?.maxRecipients ?? MAX_BROADCAST_RECIPIENTS
  const maxTotalBytes = opts?.maxTotalBytes ?? MAX_BROADCAST_TOTAL_BYTES
  const recipients = Math.max(recipientCount, 0)
  const payloadBytes = measurePayloadBytes(payloadParts)
  const totalBytes = payloadBytes * recipients

  if (recipients > maxRecipients) {
    return { allowed: false, recipients, payloadBytes, totalBytes, reason: 'too-many-recipients' }
  }
  if (totalBytes > maxTotalBytes) {
    return { allowed: false, recipients, payloadBytes, totalBytes, reason: 'budget-exceeded' }
  }
  return { allowed: true, recipients, payloadBytes, totalBytes }
}

/** Versão assert: lança `ValidationError` (mensagem amigável) quando estoura. */
export function assertBroadcastBudget(
  recipientCount: number,
  payloadParts: ReadonlyArray<unknown>,
  opts?: { maxRecipients?: number; maxTotalBytes?: number }
): void {
  const r = checkBroadcastBudget(recipientCount, payloadParts, opts)
  if (r.allowed) return
  throw new ValidationError(
    r.reason === 'too-many-recipients'
      ? 'Envio bloqueado: destinatários demais para uma única difusão.'
      : 'Envio bloqueado: o texto é grande demais para a quantidade de destinatários. Reduza o conteúdo.'
  )
}
