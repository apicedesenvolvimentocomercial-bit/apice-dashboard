import { timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Valida o header Authorization contra CRON_SECRET. Aceita os dois formatos
 * que o Vercel Cron pode enviar: `Bearer <secret>` ou `<secret>` cru.
 * Compara em tempo constante (igual ao webhook) p/ não vazar o segredo por timing.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  if (!header) return false
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
