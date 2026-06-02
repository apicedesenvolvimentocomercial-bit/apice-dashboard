import 'server-only'

import { logger } from '@/lib/logger'

import { consumeRateLimit, peekRateLimit, resetRateLimit } from './rate-limit'

/**
 * Política de rate-limit do LOGIN (seguranca-pendencias #1) sobre o limiter
 * genérico. Dois eixos:
 *   - por (email + IP): trava brute-force contra UMA conta de uma origem.
 *   - por IP: trava uma origem tentando MUITAS contas.
 * Conta só FALHAS; sucesso limpa o lockout da conta. A contagem independe de o
 * email existir → não enumera usuários (resposta constante: "inválido").
 *
 * FAIL-OPEN: se o limiter (DB) estiver indisponível, o login segue o fluxo normal
 * de senha — um limiter quebrado não pode trancar todos os usuários para fora.
 */

const WINDOW_SEC = 15 * 60
const MAX_PER_EMAIL_IP = 5
const MAX_PER_IP = 30

const emailKey = (email: string, ip: string) => `login:email:${email.toLowerCase()}:${ip}`
const ipKey = (ip: string) => `login:ip:${ip}`

/** Lockout pré-bcrypt: true se a janela já estourou (em qualquer eixo). */
export async function isLoginLocked(email: string, ip: string): Promise<boolean> {
  try {
    const [byEmail, byIp] = await Promise.all([
      peekRateLimit(emailKey(email, ip)),
      peekRateLimit(ipKey(ip)),
    ])
    return byEmail >= MAX_PER_EMAIL_IP || byIp >= MAX_PER_IP
  } catch (e) {
    logger.error('Login rate-limit indisponível (fail-open no lockout)', { error: String(e) })
    return false
  }
}

/** Registra UMA falha de login nos dois eixos. */
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  try {
    await Promise.all([
      consumeRateLimit(emailKey(email, ip), { limit: MAX_PER_EMAIL_IP, windowSec: WINDOW_SEC }),
      consumeRateLimit(ipKey(ip), { limit: MAX_PER_IP, windowSec: WINDOW_SEC }),
    ])
  } catch (e) {
    logger.error('Login rate-limit indisponível (falha não registrada)', { error: String(e) })
  }
}

/** Login bem-sucedido limpa o lockout daquela conta+origem. */
export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  try {
    await resetRateLimit(emailKey(email, ip))
  } catch {
    /* best-effort */
  }
}
