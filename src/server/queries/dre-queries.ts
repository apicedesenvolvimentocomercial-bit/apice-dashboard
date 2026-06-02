import { prisma } from '@/lib/prisma'
import { assertCan } from '@/server/auth/assert-can'
import { buildDreInput } from '@/server/services/dre/build-dre-input'
import { calcularDRE, type DREInput, type DREOutput } from '@/server/services/dre/calcular-dre'
import { resolvePeriod } from '@/server/services/kpi/period'
import type { Period } from '@/server/services/kpi/types'
import { enterClientScope } from '@/server/tenant/client-scope'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { ForbiddenError } from '@/types/errors'

export type DreReport = {
  range: { from: Date; to: Date }
  input: DREInput
  output: DREOutput
}

/**
 * DRE de UMA clínica para um período (competência). Gate `financial:read` +
 * `assertClientAccess` + `enterClientScope` (liga a RLS — esta query também é
 * chamável pelo admin numa clínica específica). Ver dre-progresso.md.
 */
export async function getDreReport(
  clientId: string,
  opts?: { period?: Period; from?: string; to?: string }
): Promise<DreReport> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  enterClientScope(clientId)
  await assertCan(ctx, 'financial', 'read')

  const range = resolvePeriod(opts?.period ?? 'month', new Date(), {
    from: opts?.from,
    to: opts?.to,
  })
  const input = await buildDreInput(ctx, clientId, range)
  return { range: { from: range.from, to: range.to }, input, output: calcularDRE(input) }
}

export type ConsolidatedDreReport = {
  range: { from: Date; to: Date }
  input: DREInput
  output: DREOutput
  byClinic: { clientId: string; clientName: string; output: DREOutput }[]
}

const DRE_INPUT_KEYS: (keyof DREInput)[] = [
  'receitaProcedimentos',
  'receitaPacotes',
  'receitaRecorrencia',
  'receitaProdutos',
  'outrasReceitas',
  'impostosSobreReceita',
  'cancelamentos',
  'inadimplencia',
  'descontos',
  'custoProdutos',
  'comissoes',
  'custosOperacionaisDiretos',
  'despesasMarketing',
  'despesasComerciais',
  'despesasAdministrativas',
  'despesasFinanceiras',
  'receitasFinanceiras',
  'depreciacao',
  'amortizacao',
  'impostoSobreLucro',
]

// `calcularDRE` é LINEAR nos inputs (toda saída em R$ é soma; o imposto sobre lucro
// já vem por-regime de cada clínica via build-dre-input). Logo, consolidar = somar os
// inputs das clínicas e calcular UMA vez — idêntico a somar as saídas, mas com margens
// corretas sobre o total. As margens (não-lineares) saem dos totais consolidados.
function sumDreInputs(inputs: DREInput[]): DREInput {
  const out: DREInput = {}
  for (const k of DRE_INPUT_KEYS) {
    out[k] = inputs.reduce((sum, i) => sum + (i[k] ?? 0), 0)
  }
  return out
}

/**
 * DRE CONSOLIDADA cross-clínica do ADMIN (ledger dre-progresso.md). Soma a DRE de
 * todas as clínicas da org no período + breakdown por clínica. Só domínio agência
 * (ADMIN/STAFF): um usuário de clínica veria as outras clínicas da org → proibido.
 * Exceção legítima de GUC nula (admin cross-clínica): buildDreInput isola por
 * `organizationId + clientId` (belt), não depende da RLS aqui.
 */
export async function getConsolidatedDreReport(opts?: {
  period?: Period
  from?: string
  to?: string
}): Promise<ConsolidatedDreReport> {
  const ctx = await getTenantContext()
  if (ctx.role !== 'ADMIN' && ctx.role !== 'STAFF') {
    throw new ForbiddenError('DRE consolidada é exclusiva do domínio agência')
  }
  await assertCan(ctx, 'financial', 'read')

  const range = resolvePeriod(opts?.period ?? 'month', new Date(), {
    from: opts?.from,
    to: opts?.to,
  })

  const clinics = await prisma.client.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const inputs = await Promise.all(clinics.map((c) => buildDreInput(ctx, c.id, range)))
  const byClinic = clinics.map((c, i) => ({
    clientId: c.id,
    clientName: c.name,
    output: calcularDRE(inputs[i]),
  }))
  const summed = sumDreInputs(inputs)

  return {
    range: { from: range.from, to: range.to },
    input: summed,
    output: calcularDRE(summed),
    byClinic,
  }
}
