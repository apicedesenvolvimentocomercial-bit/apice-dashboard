import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

/**
 * Token de webhook POR-CLÍNICA (seguranca-pendencias #2). Geramos um token de
 * alta entropia (256 bits), mostramos o token CRU uma única vez ao titular e
 * guardamos só o sha256 (hex) no banco (`Client.webhookTokenHash`). No webhook,
 * o token recebido é hasheado e resolve o `clientId` por lookup no índice único —
 * o body não decide mais a clínica.
 *
 * sha256 (sem salt) basta aqui porque o token é aleatório de 256 bits, não uma
 * senha de baixa entropia: não há dicionário a forçar, e o índice único exige um
 * hash determinístico p/ o lookup O(1).
 */
export function generateWebhookToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashWebhookToken(token) }
}

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
