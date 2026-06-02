/**
 * Backfill da DRE (Etapa A — ledger dre-progresso.md). A migration já preencheu
 * Revenue.grossAmount/status/type. Aqui criamos 1 parcela PAGA por receita existente
 * que ainda não tem parcela, para manter o CAIXA histórico coerente (toda receita
 * antiga = recebida na própria data). Idempotente: pula receitas que já têm parcela.
 *
 * Roda como DONO (bypassa RLS) — usa DIRECT_URL. Em prod: rodar 1x após o deploy.
 *   dotenv -e .env.test -- tsx prisma/backfill-dre.ts   (teste)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL })

async function main() {
  const revenues = await prisma.revenue.findMany({
    where: { deletedAt: null, receivables: { none: {} } },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      amount: true,
      date: true,
      paymentMethod: true,
    },
  })
  console.log(`Receitas sem parcela: ${revenues.length}`)
  if (revenues.length === 0) {
    console.log('Nada a fazer ✅')
    return
  }

  const result = await prisma.receivable.createMany({
    data: revenues.map((r) => ({
      organizationId: r.organizationId,
      clientId: r.clientId,
      revenueId: r.id,
      installmentNumber: 1,
      amount: r.amount,
      dueDate: r.date,
      status: 'PAGO' as const,
      paidAt: r.date,
      paymentMethod: r.paymentMethod,
    })),
  })
  console.log(`Parcelas PAGAS criadas: ${result.count} ✅`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
