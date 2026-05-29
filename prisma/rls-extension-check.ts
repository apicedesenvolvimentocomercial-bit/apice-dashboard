/**
 * Prova que a RLS enforça pelo CAMINHO REAL DO APP: o client estendido de
 * `src/lib/prisma.ts` (que injeta a GUC via $transaction([set_config, query]))
 * sob `enterClientScope`. Fecha a lacuna F4 (rls-check.ts usava client cru +
 * set_config manual; aqui exercitamos a extensão de verdade).
 *   dotenv -e .env.test -- tsx prisma/rls-extension-check.ts
 */
import { prisma } from '@/lib/prisma'
import { enterClientScope, runOutsideClientScope } from '@/server/tenant/client-scope'

async function main() {
  let failures = 0
  const check = (label: string, ok: boolean, detail: string) => {
    console.log(`${ok ? '✅' : '❌'} ${label} — ${detail}`)
    if (!ok) failures++
  }

  // Lê um paciente de clinic-b fora de escopo (admin).
  const bPatient = await runOutsideClientScope(() =>
    prisma.patient.findFirst({ where: { clientId: 'e2e-clinic-b' }, select: { id: true } })
  )
  if (!bPatient) {
    console.error('Seed faltando: paciente e2e-clinic-b. Rode `npm run seed:test`.')
    process.exit(1)
  }

  // Entra no escopo de clinic-a (igual a uma action). A extensão deve injetar a
  // GUC em cada op subsequente.
  enterClientScope('e2e-clinic-a')

  // READ: sob clinic-a, findMany SEM where não enxerga paciente de clinic-b.
  const visible = await prisma.patient.findMany({ select: { id: true } })
  check(
    'extensão READ: GUC=clinic-a não lista paciente de clinic-b',
    !visible.some((p) => p.id === bPatient.id),
    `viu ${visible.length} paciente(s); alvo presente=${visible.some((p) => p.id === bPatient.id)}`
  )

  // WRITE: sob clinic-a, update por id de paciente de clinic-b → 0 linhas.
  const upd = await prisma.patient.updateMany({
    where: { id: bPatient.id },
    data: { phone: 'HACKED-VIA-EXT' },
  })
  check(
    'extensão WRITE: GUC=clinic-a não atualiza paciente de clinic-b',
    upd.count === 0,
    `linhas afetadas=${upd.count}`
  )

  if (failures > 0) {
    console.error(`\n${failures} checagem(ns) FALHARAM — extensão de RLS não enforça.`)
    process.exit(1)
  }
  console.log('\n✅ Extensão de RLS (caminho real do app) enforça leitura e escrita.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
