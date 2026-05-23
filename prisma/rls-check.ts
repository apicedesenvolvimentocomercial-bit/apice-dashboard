/**
 * Prova de que a RLS bloqueia cross-tenant NO BANCO, independente do app.
 * Faz `patient.findMany()` SEM where (simula o app esquecendo o filtro) e
 * confere que só vêm pacientes da clínica da GUC. Roda contra o Neon:
 *   npm run rls:check   (= dotenv -e .env.test -- tsx prisma/rls-check.ts)
 */
import { PrismaClient } from '@prisma/client'

// Conecta como o role de APP (sem BYPASSRLS) — é o único jeito de a RLS valer.
// Cair no DATABASE_URL (role dono) faria o teste passar falsamente (o dono
// ignora RLS). Ver prompt/rls-gambiarra.md.
const prisma = new PrismaClient({
  datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
})

async function patientsWithScope(clientId: string | null): Promise<string[]> {
  if (clientId === null) {
    const rows = await prisma.patient.findMany({ select: { name: true } })
    return rows.map((r) => r.name)
  }
  // set_config(local=true) + a query na MESMA transação (igual à extensão).
  const [, rows] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.current_client_id', ${clientId}, true)`,
    prisma.patient.findMany({ select: { name: true } }),
  ])
  return (rows as { name: string }[]).map((r) => r.name)
}

async function main() {
  let failures = 0
  const check = (label: string, ok: boolean, detail: string) => {
    console.log(`${ok ? '✅' : '❌'} ${label} — ${detail}`)
    if (!ok) failures++
  }

  const scopedA = await patientsWithScope('e2e-clinic-a')
  check(
    'GUC=clinic-a → só Paciente Alpha (findMany SEM where)',
    scopedA.includes('Paciente Alpha') && !scopedA.includes('Paciente Bravo'),
    `retornou: [${scopedA.join(', ')}]`
  )

  const scopedB = await patientsWithScope('e2e-clinic-b')
  check(
    'GUC=clinic-b → só Paciente Bravo',
    scopedB.includes('Paciente Bravo') && !scopedB.includes('Paciente Alpha'),
    `retornou: [${scopedB.join(', ')}]`
  )

  const admin = await patientsWithScope(null)
  check(
    'GUC nula (admin) → vê todos',
    admin.includes('Paciente Alpha') && admin.includes('Paciente Bravo'),
    `retornou: [${admin.join(', ')}]`
  )

  if (failures > 0) {
    console.error(`\n${failures} checagem(ns) de RLS FALHARAM.`)
    process.exit(1)
  }
  console.log('\n✅ RLS prova: isolamento garantido no banco.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
