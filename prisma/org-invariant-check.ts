/**
 * Preflight da migration `org_invariant_fk` (J1): varre os modelos operacionais
 * procurando linhas cujo `organizationId` NÃO bate com o do Client — exatamente
 * o que o VALIDATE CONSTRAINT vai rejeitar. READ-ONLY.
 *
 * Rode contra PRODUÇÃO antes do deploy que aplica a migration:
 *   npx dotenv -e .env -- tsx prisma/org-invariant-check.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TABLES = [
  'Lead',
  'Patient',
  'Procedure',
  'Appointment',
  'Revenue',
  'Cost',
  'Receivable',
  'FixedAsset',
  'Goal',
  'Insight',
  'KpiSnapshot',
  'PipelineDeal',
  'Pipeline',
  'MessageTemplate',
  'OutboundMessage',
  'ClinicActivityType',
  'ClientNote',
  'Document',
  'Activity',
  'CalendarEvent',
]

async function main() {
  let violations = 0
  for (const table of TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count
       FROM "${table}" t
       JOIN "Client" c ON c."id" = t."clientId"
       WHERE t."organizationId" <> c."organizationId"`
    )
    const count = Number(rows[0]?.count ?? 0)
    console.log(`${count === 0 ? '✅' : '❌'} ${table}: ${count} linha(s) violando`)
    violations += count
  }

  if (violations > 0) {
    console.error(
      `\n❌ ${violations} linha(s) violam a invariante — corrija ANTES de deployar a migration org_invariant_fk.`
    )
    process.exit(1)
  }
  console.log('\n✅ Invariante organizationId == client.organizationId OK em todas as tabelas.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
