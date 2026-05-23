'use client'

import { useState } from 'react'

import { RevenueCostBars } from '@/components/charts/revenue-cost-bars'
import { InfoHint } from '@/components/dashboard/info-hint'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ReceivedRevenueChart,
  type ReceivedMonth,
} from '@/modules/dashboard/received-revenue-chart'

/**
 * Card único que reúne os dois gráficos de receita × custos do dashboard
 * (gerada e recebida) dentro da aba financeiro. A troca usa o mesmo padrão de
 * design do toggle da agenda (appointments-calendar-toggle): dois botões no
 * título, o ativo em destaque e o inativo esmaecido, com slide suave —
 * "Receita gerada" entra da esquerda, "Receita recebida" da direita.
 */
type View = 'generated' | 'received'

type Props = {
  revenueByMonth: { month: string; revenue: number; costs: number }[]
  receivedByMonth: ReceivedMonth[]
  receivedCenterIndex: number
}

export function RevenueChartsSwitch({
  revenueByMonth,
  receivedByMonth,
  receivedCenterIndex,
}: Props) {
  const [view, setView] = useState<View>('generated')

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setView('generated')}
              className={cn(
                'transition-colors',
                view === 'generated'
                  ? 'text-foreground'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              )}
            >
              Receita gerada
            </button>
            <span className="text-muted-foreground/30">/</span>
            <button
              type="button"
              onClick={() => setView('received')}
              className={cn(
                'transition-colors',
                view === 'received'
                  ? 'text-foreground'
                  : 'text-muted-foreground/40 hover:text-muted-foreground'
              )}
            >
              Receita recebida
            </button>
            <span className="font-normal text-muted-foreground">× Custos</span>
          </span>
          {view === 'generated' ? (
            <InfoHint label="Receita gerada x Custos">
              <p className="font-medium text-foreground">Receita gerada</p>
              <p className="mt-1">
                Soma do valor cheio das vendas no mês em que foram lançadas, independente do
                parcelamento. É a referência contábil de quanto foi faturado.
              </p>
              <p className="mt-2">
                <span className="font-medium">Exemplo:</span> um procedimento de R$ 5.000 parcelado
                em 12x e vendido em maio aparece como{' '}
                <span className="font-medium">R$ 5.000 em maio</span> aqui.
              </p>
            </InfoHint>
          ) : (
            <InfoHint label="Receita recebida x Custos">
              <p className="font-medium text-foreground">Receita recebida</p>
              <p className="mt-1">
                Simulação do fluxo de caixa: o valor da venda é distribuído pelos meses conforme o
                número de parcelas. Cada mês mostra o que efetivamente entra no caixa.
              </p>
              <p className="mt-2">
                <span className="font-medium">Exemplo:</span> um procedimento de R$ 5.000 parcelado
                em 12x vendido em maio aparece como{' '}
                <span className="font-medium">R$ 416,67 em maio</span> e o mesmo valor em cada um
                dos 11 meses seguintes (até abril do ano seguinte).
              </p>
              <p className="mt-2">
                <span className="font-medium">Custos futuros:</span> incluem a projeção dos custos
                fixos cadastrados (custos recorrentes ainda não lançados). Mudanças nesses custos
                refletem aqui automaticamente.
              </p>
              <p className="mt-2 text-muted-foreground">
                Use as setas para navegar pelos meses anteriores e posteriores. O mês central fica
                sempre destacado no rodapé do gráfico.
              </p>
            </InfoHint>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden">
          {view === 'generated' ? (
            <div key="generated" className="duration-300 animate-in fade-in slide-in-from-left-8">
              <RevenueCostBars data={revenueByMonth} revenueName="Receita gerada" />
            </div>
          ) : (
            <div key="received" className="duration-300 animate-in fade-in slide-in-from-right-8">
              <ReceivedRevenueChart data={receivedByMonth} centerIndex={receivedCenterIndex} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
