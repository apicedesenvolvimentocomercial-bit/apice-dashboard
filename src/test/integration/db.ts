import { PrismaClient } from '@prisma/client'

/**
 * Infra dos testes de INTEGRAÇÃO (vitest.integration.config.ts).
 *
 * Dois clients convivem aqui de propósito:
 * - O client do APP (`@/lib/prisma`) — importado pelos próprios testes — conecta
 *   pelo `DATABASE_URL` (role restrito) e carrega a extensão de RLS. É por ele
 *   que o comportamento real (escopo de clínica, scopedTransaction) é exercitado.
 * - O client ADMIN abaixo conecta pelo `DIRECT_URL` (dono do banco) e serve só
 *   para reset/seed: TRUNCATE exige privilégio de dono.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const DIRECT_URL = process.env.DIRECT_URL ?? ''

/**
 * Guard anti-desastre: os testes TRUNCAM o banco inteiro. Só prosseguem se a
 * URL parecer o banco de teste (Neon — convenção do projeto, ver CLAUDE.md);
 * `ALLOW_INTEGRATION_DB=1` libera outro host (ex.: CI com provider diferente).
 * URL de Supabase (= produção neste projeto) é recusada SEMPRE.
 */
export function assertTestDatabase(): void {
  if (!DATABASE_URL || !DIRECT_URL) {
    throw new Error(
      'Testes de integração exigem DATABASE_URL e DIRECT_URL (rode via `npm run test:integration`, que carrega o .env.test).'
    )
  }
  if (DATABASE_URL.includes('supabase') || DIRECT_URL.includes('supabase')) {
    throw new Error(
      'DATABASE_URL/DIRECT_URL apontam para Supabase (produção). Testes de integração NUNCA rodam aí.'
    )
  }
  const looksLikeTestDb = DATABASE_URL.includes('neon.tech')
  if (!looksLikeTestDb && process.env.ALLOW_INTEGRATION_DB !== '1') {
    throw new Error(
      'DATABASE_URL não parece o banco de teste (Neon). Se for intencional, exporte ALLOW_INTEGRATION_DB=1.'
    )
  }
}

let adminPrisma: PrismaClient | undefined

/** Client de manutenção (dono do banco, sem extensão de RLS) — só reset/seed. */
export function getAdminPrisma(): PrismaClient {
  if (!adminPrisma) {
    assertTestDatabase()
    adminPrisma = new PrismaClient({ datasourceUrl: DIRECT_URL })
  }
  return adminPrisma
}

/**
 * Zera TODAS as tabelas do schema public (exceto o histórico de migrations),
 * com CASCADE — independe da ordem de FKs. Cada suíte chama no beforeAll.
 */
export async function resetDb(): Promise<void> {
  assertTestDatabase()
  const admin = getAdminPrisma()
  const tables = await admin.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await admin.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

export type Baseline = {
  organizationId: string
  clinicAId: string
  clinicBId: string
}

/**
 * Cenário mínimo padrão: 1 organização com 2 clínicas (Alpha e Bravo) — o par
 * necessário para qualquer asserção de isolamento entre tenants.
 */
export async function seedBaseline(): Promise<Baseline> {
  const admin = getAdminPrisma()
  const org = await admin.organization.create({
    data: { name: 'Org Integração', slug: 'org-integracao' },
  })
  const clinicA = await admin.client.create({
    data: {
      organizationId: org.id,
      name: 'Clínica Alpha (int)',
      slug: 'alpha-int',
      status: 'ACTIVE',
    },
  })
  const clinicB = await admin.client.create({
    data: {
      organizationId: org.id,
      name: 'Clínica Bravo (int)',
      slug: 'bravo-int',
      status: 'ACTIVE',
    },
  })
  return { organizationId: org.id, clinicAId: clinicA.id, clinicBId: clinicB.id }
}

/** Encerra o client admin (afterAll da suíte). */
export async function disconnectAdmin(): Promise<void> {
  await adminPrisma?.$disconnect()
  adminPrisma = undefined
}
