import { Resend, type CreateEmailOptions } from 'resend'

import { dispatchWithRetry, type RawSendResponse, type SendEmailResult } from '@/lib/email-retry'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

export const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

// EMAIL_FROM é obrigatório quando RESEND_API_KEY está setado (validado em env.ts).
// Em dev sem Resend usamos um placeholder explícito para que o logger evidencie.
export const EMAIL_FROM = env.EMAIL_FROM ?? 'no-reply@example.com'

export type { SendEmailResult } from '@/lib/email-retry'

/**
 * Envia email pelo Resend tratando o erro corretamente.
 *
 * IMPORTANTE: o SDK do Resend NÃO lança exceção em erros de API (rate limit,
 * domínio não verificado, from inválido, validação, etc.). Ele retorna
 * `{ data: null, error }`. Os call sites antigos faziam `await
 * resend.emails.send(...)` e ignoravam esse `error`, então falhas passavam
 * despercebidas — era a causa de "não funcionar sempre" (tipicamente
 * rate_limit_exceeded 429). A política de retry/erro vive em email-retry.ts.
 */
export async function sendEmail(
  payload: Omit<CreateEmailOptions, 'from'> & { from?: string }
): Promise<SendEmailResult> {
  if (!resend) {
    logger.warn('RESEND_API_KEY não configurado — email não enviado', {
      to: payload.to,
      subject: payload.subject,
    })
    return { ok: false, error: 'resend_not_configured', skipped: true }
  }

  const client = resend
  const message = { ...payload, from: payload.from ?? EMAIL_FROM } as CreateEmailOptions

  return dispatchWithRetry(() => client.emails.send(message) as Promise<RawSendResponse>, {
    to: payload.to,
    subject: payload.subject,
    onError: (info) => logger.error('Resend falhou ao enviar email', info),
  })
}
