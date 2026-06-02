import { createHash, randomBytes } from 'node:crypto'

import { prisma } from '@/lib/prisma'

/**
 * Token de webhook POR-CLÍNICA (SEC-003·B, ledger seguranca-pendencias.md). Cada
 * clínica tem seu token; o token resolve o `clientId` server-side — o body do
 * webhook NÃO escolhe mais a clínica (antes um segredo global + clientId no body
 * deixava gravar lead em qualquer clínica de qualquer org). Armazenamos só o hash
 * sha256; o token cru só existe na config externa do provider e no instante da geração.
 */

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Gera um token novo (cru + hash). Retorna o cru p/ mostrar UMA vez ao titular. */
export function generateWebhookToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashWebhookToken(token) }
}

/**
 * Resolve o `clientId` a partir do token (header `x-webhook-token`), por hash sha256.
 * Sem GUC de RLS aqui: `Client` está fora da RLS e o clientId ainda é desconhecido;
 * o caller (ingestLead) fixa `enterClientScope` depois. null = token inválido/ausente.
 */
export async function resolveClientIdByWebhookToken(token: string): Promise<string | null> {
  if (!token) return null
  const client = await prisma.client.findUnique({
    where: { webhookTokenHash: hashWebhookToken(token) },
    select: { id: true, deletedAt: true },
  })
  if (!client || client.deletedAt) return null
  return client.id
}
