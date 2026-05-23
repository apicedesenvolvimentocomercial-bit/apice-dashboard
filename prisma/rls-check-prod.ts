/**
 * Prova de RLS em PRODUÇÃO, conectado como app_user. Auto-limpante: cria sondas
 * (org + 2 clínicas + 2 pacientes), valida o isolamento e APAGA tudo no fim.
 *
 * Uso (NÃO persiste credencial):
 *   $env:PROD_APP_URL="postgresql://app_user.<ref>:<senha>@...6543/postgres?pgbouncer=true"
 *   npx tsx prisma/rls-check-prod.ts
 */
import { PrismaClient } from '@prisma/client'

const url = process.env.PROD_APP_URL
if (!url) {
  console.error('Defina PROD_APP_URL (string do app_user no prod).')
  process.exit(1)
}
const prisma = new PrismaClient({ datasourceUrl: url })

const ORG = 'rls-probe-org'
const A = 'rls-probe-clinic-a'
const B = 'rls-probe-clinic-b'
const PA = 'rls-probe-patient-a'
const PB = 'rls-probe-patient-b'

async function cleanup() {
  await prisma.patient.deleteMany({ where: { id: { in: [PA, PB] } } })
  await prisma.client.deleteMany({ where: { id: { in: [A, B] } } })
  await prisma.organization.deleteMany({ where: { id: ORG } })
}

/** findUnique escopado pela GUC (igual à extensão: set_config local + query). */
async function find(clientId: string | null, patientId: string) {
  if (clientId === null) return prisma.patient.findUnique({ where: { id: patientId } })
  const [, row] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.current_client_id', ${clientId}, true)`,
    prisma.patient.findUnique({ where: { id: patientId } }),
  ])
  return row as { id: string } | null
}

async function main() {
  let failures = 0
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? '✅' : '❌'} ${label}`)
    if (!ok) failures++
  }

  const role = await prisma.$queryRaw<{ rolbypassrls: boolean }[]>`
    SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`
  check(`role conectado SEM bypassrls (é ${JSON.stringify(role)})`, role[0]?.rolbypassrls === false)

  await cleanup() // idempotente
  await prisma.organization.create({ data: { id: ORG, name: 'RLS Probe', slug: ORG } })
  await prisma.client.create({ data: { id: A, organizationId: ORG, name: 'Probe A', slug: A } })
  await prisma.client.create({ data: { id: B, organizationId: ORG, name: 'Probe B', slug: B } })
  await prisma.patient.create({
    data: { id: PA, organizationId: ORG, clientId: A, name: 'Probe Pac A' },
  })
  await prisma.patient.create({
    data: { id: PB, organizationId: ORG, clientId: B, name: 'Probe Pac B' },
  })

  // Escopo A: enxerga A, NÃO enxerga B (mesmo pedindo B por id).
  check('GUC=A vê paciente A', (await find(A, PA)) !== null)
  check('GUC=A NÃO vê paciente B (RLS bloqueia por id)', (await find(A, PB)) === null)
  // Escopo B: o inverso.
  check('GUC=B vê paciente B', (await find(B, PB)) !== null)
  check('GUC=B NÃO vê paciente A', (await find(B, PA)) === null)
  // Admin (sem GUC): vê os dois.
  check(
    'sem GUC (admin) vê os dois',
    (await find(null, PA)) !== null && (await find(null, PB)) !== null
  )

  if (failures > 0) {
    console.error(`\n${failures} checagem(ns) FALHARAM — RLS NÃO está enforçando no prod.`)
    process.exit(1)
  }
  console.log('\n✅ RLS enforçando no prod como app_user.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await cleanup().catch(() => {})
    await prisma.$disconnect()
  })
