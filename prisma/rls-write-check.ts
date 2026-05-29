/**
 * Prova que o isolamento cross-clínica vale também na ESCRITA (não só leitura) —
 * a classe de IDOR que o piloto financeiro fechou. Roda contra o Neon como role
 * de APP (sem BYPASSRLS), igual ao rls-check.ts:
 *   dotenv -e .env.test -- tsx prisma/rls-write-check.ts
 *
 * Cobre as duas camadas:
 *   • SUSPENDERS (RLS no banco): com GUC=clinic-a, um UPDATE mirando linha de
 *     clinic-b por id afeta 0 linhas — a policy USING/WITH CHECK barra o write.
 *   • BELT (filtro de app): where{ id: <b>, clientId: a } afeta 0 linhas mesmo
 *     sem GUC (contexto admin) — não depende da RLS.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
})

async function main() {
  let failures = 0
  const check = (label: string, ok: boolean, detail: string) => {
    console.log(`${ok ? '✅' : '❌'} ${label} — ${detail}`)
    if (!ok) failures++
  }

  // id de um paciente da clinic-b (lido em contexto admin, GUC nula).
  const bPatient = await prisma.patient.findFirst({
    where: { clientId: 'e2e-clinic-b' },
    select: { id: true, phone: true },
  })
  if (!bPatient) {
    console.error('Seed faltando: nenhum paciente em e2e-clinic-b. Rode `npm run seed:test`.')
    process.exit(1)
  }
  const originalPhone = bPatient.phone

  // SUSPENDERS: GUC=clinic-a tentando atualizar paciente de clinic-b por id.
  const [, upd] = await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('app.current_client_id', 'e2e-clinic-a', true)`,
    prisma.patient.updateMany({ where: { id: bPatient.id }, data: { phone: 'HACKED-BY-A' } }),
  ])
  check(
    'suspenders: GUC=clinic-a NÃO atualiza paciente de clinic-b (RLS barra write)',
    (upd as { count: number }).count === 0,
    `linhas afetadas=${(upd as { count: number }).count}`
  )

  // BELT: contexto admin (GUC nula) mas where com clientId errado → 0 linhas.
  const beltUpd = await prisma.patient.updateMany({
    where: { id: bPatient.id, clientId: 'e2e-clinic-a' },
    data: { phone: 'HACKED-BY-A' },
  })
  check(
    'belt: where{ id:<b>, clientId:a } → 0 linhas (filtro de app isola sem RLS)',
    beltUpd.count === 0,
    `linhas afetadas=${beltUpd.count}`
  )

  // Sanity: o telefone do paciente de clinic-b continua intacto.
  const after = await prisma.patient.findUnique({
    where: { id: bPatient.id },
    select: { phone: true },
  })
  check(
    'paciente de clinic-b intacto após as tentativas',
    after?.phone === originalPhone,
    `phone=${after?.phone ?? '∅'}`
  )

  if (failures > 0) {
    console.error(
      `\n${failures} checagem(ns) de escrita FALHARAM — isolamento cross-clínica furado.`
    )
    process.exit(1)
  }
  console.log('\n✅ Escrita isolada: belt + suspenders provados no banco.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
