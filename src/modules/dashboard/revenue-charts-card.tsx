'use client'

import { useState } from 'react'

import { RevenueCostBars } from '@/components/charts/revenue-cost-bars'
import { InfoHint } from '@/components/dashboard/info-hint'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { ReceivedRevenueChart, type ReceivedMonth } from './received-revenue-chart'

type Props = {
  generated: { month: string; revenue: number; costs: number }[]
  received: ReceivedMonth[]
  receivedCenterIndex: number
  /** Visibilidade por cargo: com um só visível, o toggle some. */
  showGenerated: boolean
  showReceived: boolean
}

/**
 * Card único de receita × custos com toggle "Gerada | Recebida" — substitui os
 * dois cards empilhados (mesma informação, metade da altura). Cada aba só
 * existe se o cargo enxergar o item correspondente do catálogo de dashboard.
 */
export function RevenueChartsCard({
  generated,
  received,
  receivedCenterIndex,
  showGenerated,
  showReceived,
}: Props) {
  const [view, setView] = useState<'generated' | 'received'>(
    showGenerated ? 'generated' : 'received'
  )
  const active = view === 'generated' && showGenerated ? 'generated' : 'received'
  const hasToggle = showGenerated && showReceived

  return (
    // h-full: na grade de unidades do dashboard este card vive num wrapper
    // com row-span fixo — o card preenche a célula inteira.
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <span>
            {active === 'generated'
              ? 'Receita gerada x Custos — últimos 12 meses'
              : 'Receita recebida x Custos'}
          </span>
          <InfoHint label="Receita x Custos">
            <p className="font-medium text-foreground">Receita gerada</p>
            <p className="mt-1">
              Soma do valor cheio das vendas no mês em que foram lançadas, independente do
              parcelamento. É a referência contábil de quanto foi faturado (vendas canceladas não
              contam).
            </p>
            <p className="mt-2 font-medium text-foreground">Receita recebida</p>
            <p className="mt-1">
              Caixa real: meses passados somam as{' '}
              <span className="font-medium">parcelas pagas</span> (pela data do pagamento); meses
              futuros mostram a previsão pelas parcelas pendentes (pelo vencimento). Parcela vencida
              e não paga não aparece — é inadimplência, visível na aba Financeiro.
            </p>
            <p className="mt-2">
              <span className="font-medium">Exemplo:</span> R$ 5.000 em 12x vendido em maio = R$
              5.000 em maio na "gerada"; na "recebida", cada parcela aparece no mês em que foi paga
              (ou tudo em maio, se a clínica antecipa o crédito).
            </p>
            <p className="mt-2">
              <span className="font-medium">Custos futuros:</span> incluem a projeção dos custos
              fixos recorrentes ainda não lançados.
            </p>
          </InfoHint>
        </CardTitle>
        {hasToggle && (
          <div
            className="inline-flex rounded-md border bg-background p-0.5 text-xs"
            role="tablist"
            aria-label="Tipo de receita"
          >
            {(
              [
                { key: 'generated', label: 'Gerada' },
                { key: 'received', label: 'Recebida' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active === opt.key}
                onClick={() => setView(opt.key)}
                className={cn(
                  'rounded px-2.5 py-1 transition-colors',
                  active === opt.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {active === 'generated' ? (
          <RevenueCostBars data={generated} revenueName="Receita gerada" />
        ) : (
          <ReceivedRevenueChart data={received} centerIndex={receivedCenterIndex} />
        )}
      </CardContent>
    </Card>
  )
}
