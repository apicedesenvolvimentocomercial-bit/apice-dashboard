// ================================
// DRE CLÍNICA ESTÉTICA (função pura)
// Fornecida pelo usuário; ledger prompt/dre-progresso.md. NÃO tem dependências —
// recebe os inputs já agregados por `build-dre-input.ts` e devolve a demonstração.
// ================================

export type DREInput = {
  // RECEITAS
  receitaProcedimentos?: number
  receitaPacotes?: number
  receitaRecorrencia?: number
  receitaProdutos?: number
  outrasReceitas?: number

  // DEDUÇÕES (sobre receita: ISS, PIS/COFINS ou Simples)
  impostosSobreReceita?: number
  cancelamentos?: number
  inadimplencia?: number
  descontos?: number

  // CSP (custo dos serviços prestados)
  custoProdutos?: number
  comissoes?: number
  custosOperacionaisDiretos?: number

  // DESPESAS OPERACIONAIS (sem juros)
  despesasMarketing?: number
  despesasComerciais?: number
  despesasAdministrativas?: number

  // FINANCEIRO / NÃO CAIXA
  despesasFinanceiras?: number // juros — fica FORA do EBITDA
  receitasFinanceiras?: number // rendimento de aplicação, juros recebidos
  depreciacao?: number
  amortizacao?: number

  // IMPOSTO SOBRE LUCRO (IRPJ/CSLL — em Simples, deixe 0)
  impostoSobreLucro?: number
}

export type DREOutput = {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  csp: number
  lucroBruto: number
  despesasOperacionais: number
  ebitda: number
  depreciacaoAmortizacao: number
  ebit: number
  resultadoFinanceiro: number
  lair: number
  impostoSobreLucro: number
  lucroLiquido: number
  margemBruta: number
  margemEbitda: number
  margemLiquida: number
}

// ======================================
// HELPERS
// ======================================

function toNumber(value?: number): number {
  if (typeof value !== 'number') return 0
  if (!Number.isFinite(value)) return 0
  return value
}

// Calcula a margem com PRECISÃO TOTAL (não arredonda aqui).
// O arredondamento para exibição é responsabilidade da camada de UI.
function percentual(valor: number, base: number): number {
  if (base <= 0) return 0
  return (valor / base) * 100
}

// ======================================
// DRE
// ======================================

export function calcularDRE(data: DREInput): DREOutput {
  // RECEITA BRUTA
  const receitaBruta =
    toNumber(data.receitaProcedimentos) +
    toNumber(data.receitaPacotes) +
    toNumber(data.receitaRecorrencia) +
    toNumber(data.receitaProdutos) +
    toNumber(data.outrasReceitas)

  // DEDUÇÕES
  const deducoes =
    toNumber(data.impostosSobreReceita) +
    toNumber(data.cancelamentos) +
    toNumber(data.inadimplencia) +
    toNumber(data.descontos)

  // RECEITA LÍQUIDA
  const receitaLiquida = receitaBruta - deducoes

  // CSP
  const csp =
    toNumber(data.custoProdutos) +
    toNumber(data.comissoes) +
    toNumber(data.custosOperacionaisDiretos)

  // LUCRO BRUTO
  const lucroBruto = receitaLiquida - csp

  // DESPESAS OPERACIONAIS (OPEX, sem juros)
  const despesasOperacionais =
    toNumber(data.despesasMarketing) +
    toNumber(data.despesasComerciais) +
    toNumber(data.despesasAdministrativas)

  // EBITDA
  const ebitda = lucroBruto - despesasOperacionais

  // DEPRECIAÇÃO + AMORTIZAÇÃO
  const depreciacaoAmortizacao = toNumber(data.depreciacao) + toNumber(data.amortizacao)

  // EBIT
  const ebit = ebitda - depreciacaoAmortizacao

  // RESULTADO FINANCEIRO (receitas financeiras - despesas financeiras)
  const resultadoFinanceiro =
    toNumber(data.receitasFinanceiras) - toNumber(data.despesasFinanceiras)

  // LAIR (lucro antes do IR)
  const lair = ebit + resultadoFinanceiro

  // IMPOSTO SOBRE LUCRO
  const impostoSobreLucro = toNumber(data.impostoSobreLucro)

  // LUCRO LÍQUIDO
  const lucroLiquido = lair - impostoSobreLucro

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    csp,
    lucroBruto,
    despesasOperacionais,
    ebitda,
    depreciacaoAmortizacao,
    ebit,
    resultadoFinanceiro,
    lair,
    impostoSobreLucro,
    lucroLiquido,
    margemBruta: percentual(lucroBruto, receitaLiquida),
    margemEbitda: percentual(ebitda, receitaLiquida),
    margemLiquida: percentual(lucroLiquido, receitaLiquida),
  }
}

// ======================================
// FORMATAÇÃO (camada de exibição)
// ======================================

export function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(2).replace('.', ',')}%`
}
