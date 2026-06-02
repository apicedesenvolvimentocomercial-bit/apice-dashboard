import { addMonths, differenceInCalendarMonths, startOfMonth } from 'date-fns'

/**
 * Depreciação (TANGÍVEL) e amortização (INTANGÍVEL) de um período (DRE — módulo de
 * ativos, ledger dre-progresso.md). Método LINEAR: cota mensal =
 * (valor de aquisição − valor residual) / vida útil em meses, contada nos meses do
 * período que caem dentro da janela de vida útil do bem e antes da baixa (disposedAt).
 *
 * Conta MÊS CHEIO por mês-calendário tocado pelo período (DRE costuma ser mensal/
 * trimestral/anual = meses inteiros). Ranges custom de meio-mês contam o mês inteiro.
 */

export type AssetForDepreciation = {
  kind: 'TANGIVEL' | 'INTANGIVEL'
  acquisitionValue: number
  residualValue: number
  acquisitionDate: Date
  usefulLifeMonths: number
  disposedAt: Date | null
}

export function depreciationForPeriod(
  assets: AssetForDepreciation[],
  range: { from: Date; to: Date }
): { depreciacao: number; amortizacao: number } {
  const rangeStartMonth = startOfMonth(range.from)
  const rangeEndMonth = startOfMonth(range.to)
  const monthsInRange = differenceInCalendarMonths(rangeEndMonth, rangeStartMonth) + 1

  let depreciacao = 0
  let amortizacao = 0

  for (const a of assets) {
    if (a.usefulLifeMonths <= 0) continue
    const monthly = (a.acquisitionValue - a.residualValue) / a.usefulLifeMonths
    if (monthly <= 0) continue

    const acqMonth = startOfMonth(a.acquisitionDate)
    const disposalMonth = a.disposedAt ? startOfMonth(a.disposedAt) : null

    let months = 0
    for (let i = 0; i < monthsInRange; i++) {
      const m = addMonths(rangeStartMonth, i)
      const idx = differenceInCalendarMonths(m, acqMonth) // meses desde a aquisição
      if (idx < 0 || idx >= a.usefulLifeMonths) continue // fora da janela de vida útil
      if (disposalMonth && m >= disposalMonth) continue // baixado → não deprecia mais
      months++
    }

    const value = monthly * months
    if (a.kind === 'TANGIVEL') depreciacao += value
    else amortizacao += value
  }

  return {
    depreciacao: Math.round(depreciacao * 100) / 100,
    amortizacao: Math.round(amortizacao * 100) / 100,
  }
}
