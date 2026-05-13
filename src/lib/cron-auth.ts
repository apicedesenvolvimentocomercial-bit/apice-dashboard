import { env } from '@/lib/env'

/**
 * Valida o header Authorization contra CRON_SECRET. Aceita os dois formatos
 * que o Vercel Cron pode enviar: `Bearer <secret>` ou `<secret>` cru.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}` || header === secret
}
