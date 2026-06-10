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

// K2 (plano de correções): toda a aritmética roda em CENTAVOS INTEIROS — a DRE
// é conferida por contador e precisa fechar no centavo (somas encadeadas em
// float derivam: 0.1+0.2 ≠ 0.3). Entradas/saídas seguem em reais (bordas).
function cents(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

const reais = (c: number): number => c / 100

// Calcula a margem com PRECISÃO TOTAL (não arredonda aqui).
// O arredondamento para exibição é responsabilidade da camada de UI.
function percentual(valorCents: number, baseCents: number): number {
  if (baseCents <= 0) return 0
  return (valorCents / baseCents) * 100
}

// ======================================
// DRE
// ======================================

export function calcularDRE(data: DREInput): DREOutput {
  // RECEITA BRUTA
  const receitaBruta =
    cents(data.receitaProcedimentos) +
    cents(data.receitaPacotes) +
    cents(data.receitaRecorrencia) +
    cents(data.receitaProdutos) +
    cents(data.outrasReceitas)

  // DEDUÇÕES
  const deducoes =
    cents(data.impostosSobreReceita) +
    cents(data.cancelamentos) +
    cents(data.inadimplencia) +
    cents(data.descontos)

  // RECEITA LÍQUIDA
  const receitaLiquida = receitaBruta - deducoes

  // CSP
  const csp =
    cents(data.custoProdutos) + cents(data.comissoes) + cents(data.custosOperacionaisDiretos)

  // LUCRO BRUTO
  const lucroBruto = receitaLiquida - csp

  // DESPESAS OPERACIONAIS (OPEX, sem juros)
  const despesasOperacionais =
    cents(data.despesasMarketing) +
    cents(data.despesasComerciais) +
    cents(data.despesasAdministrativas)

  // EBITDA
  const ebitda = lucroBruto - despesasOperacionais

  // DEPRECIAÇÃO + AMORTIZAÇÃO
  const depreciacaoAmortizacao = cents(data.depreciacao) + cents(data.amortizacao)

  // EBIT
  const ebit = ebitda - depreciacaoAmortizacao

  // RESULTADO FINANCEIRO (receitas financeiras - despesas financeiras)
  const resultadoFinanceiro = cents(data.receitasFinanceiras) - cents(data.despesasFinanceiras)

  // LAIR (lucro antes do IR)
  const lair = ebit + resultadoFinanceiro

  // IMPOSTO SOBRE LUCRO
  const impostoSobreLucro = cents(data.impostoSobreLucro)

  // LUCRO LÍQUIDO
  const lucroLiquido = lair - impostoSobreLucro

  return {
    receitaBruta: reais(receitaBruta),
    deducoes: reais(deducoes),
    receitaLiquida: reais(receitaLiquida),
    csp: reais(csp),
    lucroBruto: reais(lucroBruto),
    despesasOperacionais: reais(despesasOperacionais),
    ebitda: reais(ebitda),
    depreciacaoAmortizacao: reais(depreciacaoAmortizacao),
    ebit: reais(ebit),
    resultadoFinanceiro: reais(resultadoFinanceiro),
    lair: reais(lair),
    impostoSobreLucro: reais(impostoSobreLucro),
    lucroLiquido: reais(lucroLiquido),
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
