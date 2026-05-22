import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

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
  // Cloud = `prisma://` ou host `accelerate.prisma-data.net`.
  const url = process.env.DATABASE_URL ?? ''
  const useAccelerate = url.startsWith('prisma://') || url.includes('accelerate.prisma-data.net')
  return (useAccelerate ? base.$extends(withAccelerate()) : base) as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
