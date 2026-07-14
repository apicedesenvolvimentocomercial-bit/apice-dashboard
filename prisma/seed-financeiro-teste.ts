import { PrismaClient, type CostType, type RevenueStatus } from '@prisma/client'
import { fromZonedTime } from 'date-fns-tz'

/**
 * Seed de DADOS FINANCEIROS DE TESTE (receitas + parcelas + custos) para os N
 * meses ANTERIORES ao mês atual, numa clínica identificada pelo email do dono.
 * Serve para popular o dashboard/DRE em ambiente de testes.
 *
 * Rodar (INSPEÇÃO — não grava nada, só mostra o alvo):
 *   npx tsx prisma/seed-financeiro-teste.ts
 * Rodar (GRAVA de verdade):
 *   SEED_APPLY=1 npx tsx prisma/seed-financeiro-teste.ts
 *
 * Variáveis:
 *   SEED_OWNER_EMAIL  email do dono da clínica (default: a conta apice)
 *   SEED_MONTHS       quantos meses anteriores semear (default: 6)
 *   SEED_APPLY=1      efetiva a escrita (sem isso é dry-run)
 *   SEED_FORCE=1      re-semeia mesmo se já houver marcador (cuidado: duplica)
 *
 * Segurança:
 *   - Todo registro leva o MARCADOR no `description` → dá pra achar e limpar.
 *   - Sem a extensão de RLS a GUC fica nula → a policy tenant_isolation libera a
 *     escrita (mesmo padrão dos outros seeds). Ainda assim gravamos clientId +
 *     organizationId corretos em tudo.
 *   - LIMPAR depois:  SEED_APPLY=1 SEED_CLEAN=1 npx tsx prisma/seed-financeiro-teste.ts
 */

const OWNER_EMAIL = (
  process.env.SEED_OWNER_EMAIL ?? 'apicedesenvolvimentocomercial@gmail.com'
).toLowerCase()
const MONTHS = Number(process.env.SEED_MONTHS ?? 6)
const APPLY = process.env.SEED_APPLY === '1'
const FORCE = process.env.SEED_FORCE === '1'
const CLEAN = process.env.SEED_CLEAN === '1'
const MARKER = '[seed-teste-financeiro]'
const TZ = 'America/Sao_Paulo'

const prisma = new PrismaClient()

/** Wall-clock SP → UTC Date (meio-dia evita qualquer fronteira de mês/DST). */
function spDate(y: number, m0: number, d: number, h = 12): Date {
  return fromZonedTime(new Date(y, m0, d, h, 0, 0, 0), TZ)
}

/** RNG determinístico (mulberry32) — re-runs após limpeza dão os mesmos dados. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260710)
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const between = (min: number, max: number) => min + rnd() * (max - min)
const round2 = (n: number) => Math.round(n * 100) / 100

const PROCEDURE_SEED = [
  { name: 'Toxina Botulínica', price: 1200, cost: 320 },
  { name: 'Preenchimento Labial', price: 1800, cost: 520 },
  { name: 'Limpeza de Pele', price: 250, cost: 60 },
  { name: 'Peeling Químico', price: 420, cost: 95 },
  { name: 'Microagulhamento', price: 650, cost: 150 },
  { name: 'Skinbooster', price: 900, cost: 260 },
]

const PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'CASH', 'DEBIT_CARD', 'BOLETO']

async function main() {
  const dbHost = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '(desconhecido)'
  console.log('──────────────────────────────────────────────')
  console.log(`🌱 Seed financeiro de teste`)
  console.log(`   Banco:  ${dbHost}`)
  console.log(`   Dono:   ${OWNER_EMAIL}`)
  console.log(`   Meses:  ${MONTHS} anteriores ao atual`)
  console.log(`   Modo:   ${CLEAN ? 'LIMPEZA' : APPLY ? 'GRAVAÇÃO' : 'INSPEÇÃO (dry-run)'}`)
  console.log('──────────────────────────────────────────────')

  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, name: true, clientId: true, organizationId: true, role: true },
  })
  if (!owner) throw new Error(`Usuário ${OWNER_EMAIL} não encontrado neste banco.`)
  if (!owner.clientId) {
    throw new Error(
      `Usuário ${OWNER_EMAIL} não tem clientId (role ${owner.role}). Não é dono de clínica.`
    )
  }
  const clientId = owner.clientId
  if (!owner.organizationId) {
    throw new Error(`Usuário ${OWNER_EMAIL} não tem organizationId. Não dá para semear.`)
  }
  const organizationId = owner.organizationId

  const clinic = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, deletedAt: true },
  })
  if (!clinic || clinic.deletedAt) throw new Error(`Clínica ${clientId} não encontrada/ativa.`)
  console.log(`   Clínica alvo: "${clinic.name}" (${clinic.id})`)

  // Contagem atual de marcadores (para não duplicar).
  const [existingRev, existingCost] = await Promise.all([
    prisma.revenue.count({ where: { clientId, description: { contains: MARKER } } }),
    prisma.cost.count({ where: { clientId, description: { contains: MARKER } } }),
  ])
  console.log(`   Já existem: ${existingRev} receitas + ${existingCost} custos com marcador.`)

  // ── LIMPEZA ────────────────────────────────────────────────────────────
  if (CLEAN) {
    if (!APPLY) {
      console.log('\n(DRY-RUN) Limpeza pediria SEED_APPLY=1. Nada removido.')
      return
    }
    // Receivables e RevenueProcedure caem por cascade (onDelete: Cascade) ao
    // apagar a Revenue. Custos ligados por revenueId têm onDelete: SetNull.
    const delCost = await prisma.cost.deleteMany({
      where: { clientId, description: { contains: MARKER } },
    })
    const revs = await prisma.revenue.findMany({
      where: { clientId, description: { contains: MARKER } },
      select: { id: true },
    })
    const delRcv = await prisma.receivable.deleteMany({
      where: { revenueId: { in: revs.map((r) => r.id) } },
    })
    const delRev = await prisma.revenue.deleteMany({
      where: { clientId, description: { contains: MARKER } },
    })
    console.log(
      `🧹 Removidos: ${delRev.count} receitas, ${delRcv.count} parcelas, ${delCost.count} custos.`
    )
    return
  }

  if (existingRev > 0 && !FORCE) {
    console.log(
      `\n⚠️  Já há dados semeados (marcador). Para re-semear use SEED_FORCE=1 (duplica) ou limpe com SEED_CLEAN=1.`
    )
    return
  }

  // ── Procedimentos: reusa os da clínica; cria um kit se faltar variedade. ──
  let procedures = await prisma.procedure.findMany({
    where: { clientId, deletedAt: null, isActive: true },
    select: { id: true, name: true, price: true, cost: true },
  })
  console.log(`   Procedimentos existentes: ${procedures.length}`)

  const now = new Date()
  const months: { y: number; m0: number; label: string }[] = []
  for (let i = MONTHS; i >= 1; i--) {
    const first = spDate(now.getFullYear(), now.getMonth() - i, 1)
    const z = new Date(first)
    // rótulo YYYY-MM em SP
    const y = Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(z))
    const m = Number(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: 'numeric' }).format(z))
    months.push({ y, m0: m - 1, label: `${y}-${String(m).padStart(2, '0')}` })
  }

  // Volume de vendas por mês (leve tendência de alta). Fator central p/ manter
  // a receita bem acima dos custos (clínica lucrativa — bom fixture de DRE).
  const salesForMonth = (mi: number) => 28 + mi * 2 + Math.floor(rnd() * 7)

  // Plano (contagens) — mostrado no dry-run.
  let plannedRev = 0
  let plannedCost = 0
  const rndPlan = mulberry32(1) // não consome o rnd principal
  for (let mi = 0; mi < months.length; mi++) plannedRev += 28 + mi * 2 + Math.floor(rndPlan() * 7)
  plannedCost = months.length * 7 // ~7 custos/mês (fixos, folha, mkt, admin, imposto, comissão, variável)

  if (!APPLY) {
    console.log(`\n(DRY-RUN) Semearia ~${plannedRev} receitas e ~${plannedCost} custos:`)
    for (const mm of months) console.log(`   • ${mm.label}`)
    console.log(
      `\n   Para EFETIVAR:  SEED_APPLY=1 npx tsx prisma/seed-financeiro-teste.ts` +
        (OWNER_EMAIL !== 'apicedesenvolvimentocomercial@gmail.com'
          ? `  (SEED_OWNER_EMAIL=${OWNER_EMAIL})`
          : '')
    )
    console.log(`   Nenhum registro foi gravado.`)
    return
  }

  // A partir daqui, GRAVA de verdade.
  if (procedures.length < 3) {
    const created = []
    for (const p of PROCEDURE_SEED) {
      const proc = await prisma.procedure.create({
        data: {
          organizationId,
          clientId,
          name: p.name,
          description: MARKER,
          price: p.price,
          cost: p.cost,
          durationMinutes: 30,
          isActive: true,
        },
        select: { id: true, name: true, price: true, cost: true },
      })
      created.push(proc)
    }
    procedures = [...procedures, ...created]
    console.log(`   + ${created.length} procedimentos de teste criados.`)
  }

  let revCount = 0
  let rcvCount = 0
  const costRows: {
    organizationId: string
    clientId: string
    type: CostType
    category: string
    amount: number
    date: Date
    description: string
    createdById: string
  }[] = []

  for (let mi = 0; mi < months.length; mi++) {
    const { y, m0, label } = months[mi]
    const nRev = salesForMonth(mi)
    let monthGross = 0

    for (let k = 0; k < nRev; k++) {
      const proc = pick(procedures)
      const qty = rnd() < 0.15 ? 2 : 1 // eventual pacote
      const gross = round2(Number(proc.price) * qty)
      const hasDiscount = rnd() < 0.25
      const discount = hasDiscount ? round2(gross * between(0.05, 0.15)) : 0
      const amount = round2(gross - discount)

      const day = 1 + Math.floor(rnd() * 27)
      const date = spDate(y, m0, day)
      const method = pick(PAYMENT_METHODS)
      const installments = method === 'CREDIT_CARD' ? 1 + Math.floor(rnd() * 4) : 1

      // Distribuição de status: maioria QUITADA; algumas ABERTA; rara CANCELADA.
      const roll = rnd()
      const status: RevenueStatus = roll < 0.78 ? 'QUITADA' : roll < 0.95 ? 'ABERTA' : 'CANCELADA'
      // Base de custos = receita RECONHECIDA (venda cancelada não é receita).
      if (status !== 'CANCELADA') monthGross += amount

      // Parcelas
      const per = round2(amount / installments)
      const receivables: {
        organizationId: string
        clientId: string
        installmentNumber: number
        amount: number
        dueDate: Date
        status: 'PENDENTE' | 'PAGO' | 'PERDIDO' | 'CANCELADO'
        paidAt: Date | null
        paymentMethod: string
        writtenOffAt: Date | null
      }[] = []
      for (let inst = 0; inst < installments; inst++) {
        // vencimento: mês da venda + inst meses
        const dueDate = spDate(y, m0 + inst, Math.min(day, 27))
        let rStatus: 'PENDENTE' | 'PAGO' | 'PERDIDO' | 'CANCELADO' = 'PENDENTE'
        let paidAt: Date | null = null
        let writtenOffAt: Date | null = null
        if (status === 'CANCELADA') {
          rStatus = 'CANCELADO'
        } else if (status === 'QUITADA') {
          rStatus = 'PAGO'
          paidAt = dueDate
        } else {
          // ABERTA: 1ª parcela paga; ~15% de chance de uma virar inadimplência.
          if (inst === 0) {
            rStatus = 'PAGO'
            paidAt = dueDate
          } else if (rnd() < 0.15) {
            rStatus = 'PERDIDO'
            writtenOffAt = dueDate
          } else {
            rStatus = 'PENDENTE'
          }
        }
        // last installment ajusta centavos
        const instAmount =
          inst === installments - 1 ? round2(amount - per * (installments - 1)) : per
        receivables.push({
          organizationId,
          clientId,
          installmentNumber: inst + 1,
          amount: instAmount,
          dueDate,
          status: rStatus,
          paidAt,
          paymentMethod: method,
          writtenOffAt,
        })
      }

      await prisma.revenue.create({
        data: {
          organizationId,
          clientId,
          procedureId: proc.id,
          type: 'PROCEDIMENTO',
          grossAmount: gross,
          discount,
          amount,
          status,
          date,
          description: `${MARKER} ${proc.name}`,
          paymentMethod: method,
          installments,
          createdById: owner.id,
          ...(status === 'CANCELADA' ? { canceledAt: date, cancelReason: 'Teste (seed)' } : {}),
          receivables: { create: receivables },
        },
      })
      revCount++
      rcvCount += receivables.length
    }

    // ── Custos do mês (base + variável proporcional à receita) ──
    const c = (type: CostType, category: string, amount: number, day: number) =>
      costRows.push({
        organizationId,
        clientId,
        type,
        category,
        amount: round2(amount),
        date: spDate(y, m0, day),
        description: `${MARKER} ${category}`,
        createdById: owner.id,
      })
    // Custos: fixos modestos + variáveis proporcionais à receita → margem
    // líquida positiva (~20-30%), dashboard/DRE com resultado saudável.
    c('FIXED', 'Aluguel', between(1600, 2100), 5)
    c('PAYROLL', 'Folha de pagamento', between(4500, 5500), 5)
    c('MARKETING', 'Tráfego pago', monthGross * between(0.05, 0.08), 10)
    c('ADMINISTRATIVE', 'Despesas administrativas', between(400, 700), 12)
    c('VARIABLE', 'Insumos de procedimentos', monthGross * between(0.1, 0.14), 15)
    c('COMMISSION', 'Comissões', monthGross * between(0.07, 0.1), 20)
    c('TAX_REVENUE', 'Impostos sobre receita', monthGross * 0.06, 20)

    console.log(`   ✔ ${label}: ${nRev} receitas (bruto reconhecido ~R$ ${monthGross.toFixed(0)})`)
  }

  const costRes = await prisma.cost.createMany({ data: costRows })
  console.log('──────────────────────────────────────────────')
  console.log(`✅ Gravado: ${revCount} receitas, ${rcvCount} parcelas, ${costRes.count} custos.`)
  console.log(`   Marcador: "${MARKER}"`)
  console.log(`   Limpar:   SEED_APPLY=1 SEED_CLEAN=1 npx tsx prisma/seed-financeiro-teste.ts`)
}

main()
  .catch((e) => {
    console.error('❌', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
