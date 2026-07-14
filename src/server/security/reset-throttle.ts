import 'server-only'

import { logger } from '@/lib/logger'

import {
  consumeRateLimit,
  getRateLimitState,
  resetRateLimit,
  setRateLimitBlock,
} from './rate-limit'

/**
 * Rate-limit da RECUPERAÇÃO DE SENHA. Espelha a política do login-throttle, mas
 * conta REQUESTS (todo pedido conta, não só falhas — cada envio de e-mail é custo
 * real e vetor de email-bombing).
 *
 * PEDIR RESET (`forgot-password`) — dois eixos:
 *   - por CONTA (email, independente de IP): teto de e-mails de reset enviados a
 *     UMA vítima — defesa central contra email-bombing distribuído.
 *   - por IP: trava uma origem pedindo reset de MUITAS contas (enumeração/flood).
 *   A contagem independe de o email existir → não enumera usuários (a action
 *   responde `ok(null)` constante em qualquer caso).
 *
 * CONSUMIR TOKEN (`reset-password`) — por IP: trava força-bruta de token de uma
 * origem. Não há eixo "por conta" aqui: a conta só é conhecida DEPOIS de o token
 * validar, e revelá-la antes enumeraria usuários.
 *
 * COOLDOWN PROGRESSIVO: ao estourar o teto por conta, abre um bloqueio cuja
 * duração DOBRA a cada reincidência (5min → 10 → … até 1h). Os "strikes"
 * persistem 24h (mesmo após o cooldown expirar) para punir reincidência.
 *
 * FAIL-OPEN: se o limiter (DB) estiver indisponível, o fluxo segue normalmente —
 * um limiter quebrado não pode trancar todos os usuários para fora da
 * recuperação de senha.
 */

// ── Pedir reset (forgot-password) ────────────────────────────────────────────
const ACCT_WINDOW_SEC = 60 * 60 // janela p/ pedidos por conta (1h)
const MAX_PER_ACCT = 3 // pedidos por conta na janela antes de abrir cooldown
const REQ_IP_WINDOW_SEC = 60 * 60
const MAX_REQ_PER_IP = 15 // pedidos por IP (qualquer conta) na janela
const BASE_COOLDOWN_SEC = 5 * 60 // 1º cooldown = 5 min
const MAX_COOLDOWN_SEC = 60 * 60 // teto = 1 h
const STRIKE_TTL_SEC = 24 * 60 * 60 // memória dos strikes (escalada)

// ── Consumir token (reset-password) ──────────────────────────────────────────
const ATTEMPT_WINDOW_SEC = 15 * 60 // janela p/ tentativas de token por IP
const MAX_ATTEMPTS_PER_IP = 10 // tentativas inválidas por IP na janela

const acctKey = (email: string) => `reset:acct:${email.toLowerCase()}`
const lockKey = (email: string) => `reset:acct-lock:${email.toLowerCase()}`
const strikeKey = (email: string) => `reset:acct-strike:${email.toLowerCase()}`
const reqIpKey = (ip: string) => `reset:ip:${ip}`
const attemptKey = (ip: string) => `reset:attempt:${ip}`

/**
 * Segundos restantes de bloqueio p/ PEDIR reset (0 = liberado). Considera o
 * cooldown da conta E o teto por-IP. Chamado antes de gastar trabalho (lookup +
 * envio de e-mail) e não revela se o e-mail existe.
 */
export async function getResetRequestLockSeconds(email: string, ip: string): Promise<number> {
  try {
    const [lock, ipState] = await Promise.all([
      getRateLimitState(lockKey(email)),
      getRateLimitState(reqIpKey(ip)),
    ])
    const ipBlocked = ipState.count >= MAX_REQ_PER_IP ? ipState.remainingSec : 0
    return Math.max(lock.remainingSec, ipBlocked)
  } catch (e) {
    logger.error('Reset rate-limit indisponível (fail-open no lockout)', { error: String(e) })
    return 0
  }
}

/** Compat booleano: true se há qualquer bloqueio ativo p/ pedir reset. */
export async function isResetRequestLocked(email: string, ip: string): Promise<boolean> {
  return (await getResetRequestLockSeconds(email, ip)) > 0
}

/**
 * Registra UM pedido de reset. Conta no eixo conta e no eixo IP; ao estourar o
 * teto da conta, escala o strike e abre um cooldown progressivo. Retorna os
 * segundos de cooldown abertos agora (0 se ainda não bloqueou).
 */
export async function recordResetRequest(email: string, ip: string): Promise<number> {
  try {
    const [ipRes, acctRes] = await Promise.all([
      consumeRateLimit(reqIpKey(ip), { limit: MAX_REQ_PER_IP, windowSec: REQ_IP_WINDOW_SEC }),
      consumeRateLimit(acctKey(email), { limit: MAX_PER_ACCT, windowSec: ACCT_WINDOW_SEC }),
    ])

    if (acctRes.count >= MAX_PER_ACCT) {
      // Estourou o teto da conta → escala o strike e abre cooldown crescente.
      const strike = await consumeRateLimit(strikeKey(email), {
        limit: Number.MAX_SAFE_INTEGER,
        windowSec: STRIKE_TTL_SEC,
      })
      const cooldown = Math.min(MAX_COOLDOWN_SEC, BASE_COOLDOWN_SEC * 2 ** (strike.count - 1))
      await setRateLimitBlock(lockKey(email), strike.count, cooldown)
      // Zera a janela de pedidos: a próxima rodada recomeça só após o cooldown.
      await resetRateLimit(acctKey(email))
      return cooldown
    }

    // Sem cooldown da conta, mas o IP pode ter estourado (flood multi-conta).
    return ipRes.allowed ? 0 : ipRes.retryAfterSec
  } catch (e) {
    logger.error('Reset rate-limit indisponível (pedido não registrado)', { error: String(e) })
    return 0
  }
}

/**
 * Segundos restantes de bloqueio p/ CONSUMIR token (0 = liberado). Teto por IP de
 * tentativas inválidas — trava força-bruta de token de uma origem.
 */
export async function getResetAttemptLockSeconds(ip: string): Promise<number> {
  try {
    const s = await getRateLimitState(attemptKey(ip))
    return s.count >= MAX_ATTEMPTS_PER_IP ? s.remainingSec : 0
  } catch (e) {
    logger.error('Reset rate-limit indisponível (fail-open no attempt)', { error: String(e) })
    return 0
  }
}

/** Compat booleano: true se o IP estourou o teto de tentativas de token. */
export async function isResetAttemptLocked(ip: string): Promise<boolean> {
  return (await getResetAttemptLockSeconds(ip)) > 0
}

/** Registra UMA tentativa inválida de token (token errado/usado/expirado). */
export async function recordResetTokenFailure(ip: string): Promise<void> {
  try {
    await consumeRateLimit(attemptKey(ip), {
      limit: MAX_ATTEMPTS_PER_IP,
      windowSec: ATTEMPT_WINDOW_SEC,
    })
  } catch (e) {
    logger.error('Reset rate-limit indisponível (tentativa não registrada)', { error: String(e) })
  }
}
