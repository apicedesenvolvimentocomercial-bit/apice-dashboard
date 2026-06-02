import 'server-only'

import { logger } from '@/lib/logger'

import {
  consumeRateLimit,
  getRateLimitState,
  resetRateLimit,
  setRateLimitBlock,
} from './rate-limit'

/**
 * Política de rate-limit do LOGIN (seguranca-pendencias #1) sobre o limiter genérico.
 * Dois eixos:
 *   - por (email + IP): trava brute-force contra UMA conta de uma origem.
 *   - por IP: trava uma origem tentando MUITAS contas.
 * Conta só FALHAS; sucesso limpa o lockout da conta. A contagem independe de o email
 * existir → não enumera usuários (resposta constante: "inválido").
 *
 * COOLDOWN PROGRESSIVO: ao estourar o teto de falhas, abre um bloqueio cuja duração
 * DOBRA a cada reincidência (1min → 2 → 4 → … até 1h). Os "strikes" persistem por 24h
 * (mesmo após o cooldown expirar) para punir tentativas repetidas. O bloqueio expõe o
 * tempo restante (`getLoginLockSeconds`) para a UI avisar o cooldown.
 *
 * FAIL-OPEN: se o limiter (DB) estiver indisponível, o login segue o fluxo normal de
 * senha — um limiter quebrado não pode trancar todos os usuários para fora.
 */

const FAIL_WINDOW_SEC = 15 * 60 // janela p/ acumular falhas (email+IP)
const MAX_PER_EMAIL_IP = 5 // falhas na janela antes de abrir cooldown
const IP_WINDOW_SEC = 15 * 60
const MAX_PER_IP = 30 // falhas por IP (qualquer conta) na janela
const BASE_COOLDOWN_SEC = 60 // 1º cooldown = 1 min
const MAX_COOLDOWN_SEC = 60 * 60 // teto = 1 h
const STRIKE_TTL_SEC = 24 * 60 * 60 // memória dos strikes (escalada)

const failKey = (email: string, ip: string) => `login:fail:${email.toLowerCase()}:${ip}`
const lockKey = (email: string, ip: string) => `login:lock:${email.toLowerCase()}:${ip}`
const strikeKey = (email: string, ip: string) => `login:strike:${email.toLowerCase()}:${ip}`
const ipKey = (ip: string) => `login:ip:${ip}`

/**
 * Segundos restantes de bloqueio (0 = liberado). Considera o cooldown da conta+origem
 * E o teto por-IP. Pré-bcrypt no `authorize` e exposto à UI para o aviso de cooldown.
 */
export async function getLoginLockSeconds(email: string, ip: string): Promise<number> {
  try {
    const [lock, ipState] = await Promise.all([
      getRateLimitState(lockKey(email, ip)),
      getRateLimitState(ipKey(ip)),
    ])
    const ipBlocked = ipState.count >= MAX_PER_IP ? ipState.remainingSec : 0
    return Math.max(lock.remainingSec, ipBlocked)
  } catch (e) {
    logger.error('Login rate-limit indisponível (fail-open no lockout)', { error: String(e) })
    return 0
  }
}

/** Compat booleano (authorize): true se há qualquer bloqueio ativo. */
export async function isLoginLocked(email: string, ip: string): Promise<boolean> {
  return (await getLoginLockSeconds(email, ip)) > 0
}

/**
 * Registra UMA falha de login. Conta na janela email+IP e por IP; ao estourar o teto
 * email+IP, escala o strike e abre um cooldown progressivo. Retorna os segundos de
 * cooldown abertos agora (0 se ainda não bloqueou) — a UI usa p/ avisar.
 */
export async function recordLoginFailure(email: string, ip: string): Promise<number> {
  try {
    const [ipRes, failRes] = await Promise.all([
      consumeRateLimit(ipKey(ip), { limit: MAX_PER_IP, windowSec: IP_WINDOW_SEC }),
      consumeRateLimit(failKey(email, ip), { limit: MAX_PER_EMAIL_IP, windowSec: FAIL_WINDOW_SEC }),
    ])

    if (failRes.count >= MAX_PER_EMAIL_IP) {
      // Estourou o teto da conta+origem → escala o strike e abre cooldown crescente.
      const strike = await consumeRateLimit(strikeKey(email, ip), {
        limit: Number.MAX_SAFE_INTEGER,
        windowSec: STRIKE_TTL_SEC,
      })
      const cooldown = Math.min(MAX_COOLDOWN_SEC, BASE_COOLDOWN_SEC * 2 ** (strike.count - 1))
      await setRateLimitBlock(lockKey(email, ip), strike.count, cooldown)
      // Zera a janela de falhas: a próxima rodada recomeça só após o cooldown.
      await resetRateLimit(failKey(email, ip))
      return cooldown
    }

    // Sem cooldown da conta, mas o IP pode ter estourado (flood multi-conta).
    return ipRes.allowed ? 0 : ipRes.retryAfterSec
  } catch (e) {
    logger.error('Login rate-limit indisponível (falha não registrada)', { error: String(e) })
    return 0
  }
}

/** Login bem-sucedido limpa o lockout daquela conta+origem (mantém os strikes/TTL). */
export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  try {
    await Promise.all([resetRateLimit(failKey(email, ip)), resetRateLimit(lockKey(email, ip))])
  } catch {
    /* best-effort */
  }
}
