import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

import { currentClientId } from '@/server/tenant/client-scope'

// Accelerate é aplicado em runtime para fazer pooling de conexão com o Prisma
// Postgres. Declaramos o tipo exportado como `PrismaClient` puro porque a
// inferência de tipos do `$extends` em Prisma 5.x perde a forma de relações
// (`include`) e Decimals — degradando a tipagem em todo o codebase. Como não
// usamos métodos exclusivos da extensão (ex.: `cacheStrategy`), o cast é seguro.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

  // Aplicar `withAccelerate()` SÓ na Accelerate cloud real. O Prisma Postgres
  // LOCAL (`npx prisma dev`, host loopback) fala o protocolo nativamente via
  // HTTP — a extensão força HTTPS e quebraria com "fetch failed" (P5010).
  // Cloud = `prisma://` ou host `accelerate.prisma-data.net`. Castamos para
  // `PrismaClient` aqui (tipo raso) para que o `$extends` da RLS abaixo não
  // empilhe tipos e estoure "excessively deep" (TS2589).
  const url = process.env.DATABASE_URL ?? ''
  const useAccelerate = url.startsWith('prisma://') || url.includes('accelerate.prisma-data.net')
  const baseClient = (useAccelerate
    ? base.$extends(withAccelerate())
    : base) as unknown as PrismaClient

  // RLS (ver `prompt/rls-gambiarra.md`): quando há escopo de clínica no request
  // (AsyncLocalStorage), injeta `SET app.current_client_id` ANTES da query, na
  // MESMA transação (array `$transaction` = uma conexão, um SET LOCAL). As
  // policies de RLS no banco usam essa GUC. Sem escopo (admin) → roda direto e
  // a policy `GUC IS NULL` libera tudo. `$executeRaw` não é op de modelo, então
  // não dispara este hook (sem recursão).
  let client!: PrismaClient
  client = baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const clientId = currentClientId()
          if (!clientId) return query(args)
          const [, result] = await client.$transaction([
            client.$executeRaw`SELECT set_config('app.current_client_id', ${clientId}, true)`,
            query(args),
          ])
          return result
        },
      },
    },
  }) as unknown as PrismaClient
  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
