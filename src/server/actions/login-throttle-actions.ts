'use server'

import { headers } from 'next/headers'

import { getIpFromHeaders } from '@/lib/request-ip'
import { getLoginLockSeconds } from '@/server/security/login-throttle'

/**
 * Segundos de cooldown ativos p/ esta conta+origem (0 = liberado). A UI do login
 * chama após uma falha para avisar "tente de novo em Xs". Não revela se o e-mail
 * existe (o cooldown vale para qualquer e-mail tentado dessa origem).
 */
export async function getLoginCooldownAction(email: string): Promise<number> {
  if (!email) return 0
  const h = await headers()
  return getLoginLockSeconds(email, getIpFromHeaders(h))
}
