import { describe, expect, it } from 'vitest'

import { calcularDRE } from './calcular-dre'

/**
 * K2 (plano de correções): a DRE é conferida por contador — as linhas precisam
 * fechar NO CENTAVO. Aritmética encadeada em float deriva (0.1+0.2 ≠ 0.3);
 * o cálculo interno deve ser em centavos inteiros.
 */
describe('calcularDRE — exatidão de centavos', () => {
  it('soma de receitas fecha exato (caso 0.1 + 0.2)', () => {
    const out = calcularDRE({ receitaProcedimentos: 0.1, receitaPacotes: 0.2 })
    expect(out.receitaBruta).toBe(0.3) // float cru daria 0.30000000000000004
  })

  it('valores repetidos não derivam (5 × 1111.11)', () => {
    const out = calcularDRE({
      receitaProcedimentos: 1111.11,
      receitaPacotes: 1111.11,
      receitaRecorrencia: 1111.11,
      receitaProdutos: 1111.11,
      outrasReceitas: 1111.11,
    })
    expect(out.receitaBruta).toBe(5555.55)
  })

  it('a cadeia inteira fecha no centavo (identidade contábil)', () => {
    const out = calcularDRE({
      receitaProcedimentos: 10000.1,
      receitaPacotes: 2000.2,
      receitaRecorrencia: 300.3,
      receitaProdutos: 40.04,
      outrasReceitas: 5.05,
      impostosSobreReceita: 1234.56,
      cancelamentos: 78.9,
      inadimplencia: 12.34,
      descontos: 56.78,
      custoProdutos: 999.99,
      comissoes: 888.88,
      custosOperacionaisDiretos: 77.77,
      despesasMarketing: 666.66,
      despesasComerciais: 55.55,
      despesasAdministrativas: 444.44,
      despesasFinanceiras: 33.33,
      receitasFinanceiras: 22.22,
      depreciacao: 111.11,
      amortizacao: 9.09,
      impostoSobreLucro: 123.45,
    })

    // Valores de referência calculados à mão em centavos inteiros.
    expect(out.receitaBruta).toBe(12345.69)
    expect(out.deducoes).toBe(1382.58)
    expect(out.receitaLiquida).toBe(10963.11)
    expect(out.csp).toBe(1966.64)
    expect(out.lucroBruto).toBe(8996.47)
    expect(out.despesasOperacionais).toBe(1166.65)
    expect(out.ebitda).toBe(7829.82)
    expect(out.depreciacaoAmortizacao).toBe(120.2)
    expect(out.ebit).toBe(7709.62)
    expect(out.resultadoFinanceiro).toBe(-11.11)
    expect(out.lair).toBe(7698.51)
    expect(out.lucroLiquido).toBe(7575.06)

    // Identidade: lucroLiquido reconstruído pelas linhas bate EXATO.
    const reconstruido =
      out.receitaLiquida -
      out.csp -
      out.despesasOperacionais -
      out.depreciacaoAmortizacao +
      out.resultadoFinanceiro -
      out.impostoSobreLucro
    expect(out.lucroLiquido).toBe(Math.round(reconstruido * 100) / 100)
  })
})
