'use server'

import { headers } from 'next/headers'

import { getLoginLockSeconds } from '@/server/security/login-throttle'

// IP a partir dos headers (server action não recebe Request). Mesma lógica de
// getRequestIp, mas sobre os headers da action.
function ipFromHeaders(h: Headers): string {
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Segundos de cooldown ativos p/ esta conta+origem (0 = liberado). A UI do login
 * chama após uma falha para avisar "tente de novo em Xs". Não revela se o e-mail
 * existe (o cooldown vale para qualquer e-mail tentado dessa origem).
 */
export async function getLoginCooldownAction(email: string): Promise<number> {
  if (!email) return 0
  const h = await headers()
  return getLoginLockSeconds(email, ipFromHeaders(h))
}
