// Política de retry para envio de email, isolada de env/logger/SDK para ser
// testável puramente. resend.ts injeta a função de envio concreta.

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; skipped?: boolean }

// Resposta crua do SDK do Resend: ele NUNCA lança em erro de API, devolve
// { data, error }. Modelamos só o que consumimos.
export type RawSendResponse = {
  data: { id: string } | null
  error: { name: string; message: string } | null
}

export const MAX_ATTEMPTS = 3
export const BACKOFF_BASE_MS = 600

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Aplica a política de retry sobre uma função `send` arbitrária.
 * - Sucesso (`error == null`) → ok.
 * - `rate_limit_exceeded` → backoff crescente e retenta até maxAttempts.
 * - Outro `error` → falha definitiva, sem retry.
 * - Exceção lançada (rede) → retenta até maxAttempts.
 */
export async function dispatchWithRetry(
  send: () => Promise<RawSendResponse>,
  ctx: { to: unknown; subject: string; onError?: (info: Record<string, unknown>) => void },
  opts: {
    maxAttempts?: number
    backoffBaseMs?: number
    sleepFn?: (ms: number) => Promise<void>
  } = {}
): Promise<SendEmailResult> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
  const backoff = opts.backoffBaseMs ?? BACKOFF_BASE_MS
  const doSleep = opts.sleepFn ?? defaultSleep

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await send()
      if (!error) return { ok: true, id: data?.id ?? null }

      if (error.name === 'rate_limit_exceeded' && attempt < maxAttempts) {
        await doSleep(backoff * attempt)
        continue
      }

      ctx.onError?.({
        to: ctx.to,
        subject: ctx.subject,
        errorName: error.name,
        errorMessage: error.message,
        attempt,
      })
      return { ok: false, error: `${error.name}: ${error.message}` }
    } catch (err) {
      if (attempt < maxAttempts) {
        await doSleep(backoff * attempt)
        continue
      }
      const msg = err instanceof Error ? err.message : String(err)
      ctx.onError?.({ to: ctx.to, subject: ctx.subject, error: msg, thrown: true })
      return { ok: false, error: msg }
    }
  }
  return { ok: false, error: 'max_retries_exceeded' }
}
