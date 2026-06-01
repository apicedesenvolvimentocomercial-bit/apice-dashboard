import { describe, expect, it } from 'vitest'

import { calcularDRE } from './calcular-dre'

describe('calcularDRE', () => {
  it('encadeia receita bruta -> lucro líquido corretamente', () => {
    const r = calcularDRE({
      receitaProcedimentos: 10000,
      receitaProdutos: 2000,
      // deduções
      impostosSobreReceita: 600,
      descontos: 400,
      cancelamentos: 0,
      inadimplencia: 0,
      // CSP
      custoProdutos: 1500,
      comissoes: 500,
      // OPEX
      despesasMarketing: 800,
      despesasAdministrativas: 1200,
      // financeiro / não-caixa
      depreciacao: 300,
      amortizacao: 100,
      despesasFinanceiras: 200,
      receitasFinanceiras: 50,
      impostoSobreLucro: 0,
    })

    expect(r.receitaBruta).toBe(12000)
    expect(r.deducoes).toBe(1000) // 600 + 400
    expect(r.receitaLiquida).toBe(11000)
    expect(r.csp).toBe(2000) // 1500 + 500
    expect(r.lucroBruto).toBe(9000)
    expect(r.despesasOperacionais).toBe(2000) // 800 + 1200
    expect(r.ebitda).toBe(7000)
    expect(r.depreciacaoAmortizacao).toBe(400)
    expect(r.ebit).toBe(6600)
    expect(r.resultadoFinanceiro).toBe(-150) // 50 - 200
    expect(r.lair).toBe(6450)
    expect(r.lucroLiquido).toBe(6450)
    // margens sobre receita líquida
    expect(r.margemBruta).toBeCloseTo((9000 / 11000) * 100, 6)
    expect(r.margemLiquida).toBeCloseTo((6450 / 11000) * 100, 6)
  })

  it('imposto sobre lucro entra DEPOIS do LAIR', () => {
    const r = calcularDRE({ receitaProcedimentos: 1000, impostoSobreLucro: 150 })
    expect(r.lair).toBe(1000)
    expect(r.lucroLiquido).toBe(850)
  })

  it('input vazio = tudo zero, margens 0 (sem divisão por zero)', () => {
    const r = calcularDRE({})
    expect(r.receitaBruta).toBe(0)
    expect(r.lucroLiquido).toBe(0)
    expect(r.margemBruta).toBe(0)
    expect(r.margemEbitda).toBe(0)
    expect(r.margemLiquida).toBe(0)
  })

  it('valores inválidos (NaN/undefined) tratados como 0', () => {
    const r = calcularDRE({ receitaProcedimentos: NaN, receitaProdutos: 100 })
    expect(r.receitaBruta).toBe(100)
  })
})
