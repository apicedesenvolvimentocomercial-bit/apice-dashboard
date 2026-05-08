'use client'

import dynamic from 'next/dynamic'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from './types'
import type { FinancialSummary, ChartMonth } from './types'

const RevenueCostChart = dynamic(
  () => import('./revenue-cost-chart').then((m) => m.RevenueCostChart),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" /> }
)

type Props = {
  summary: FinancialSummary
  chartData: ChartMonth[]
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const delta = ((current - previous) / previous) * 100
  if (Math.abs(delta) < 0.1) return <Minus className="h-3 w-3 text-muted-foreground" />
  return delta > 0 ? (
    <span className="flex items-center gap-0.5 text-xs text-green-600">
      <TrendingUp className="h-3 w-3" />
      {formatPercent(delta)}
    </span>
  ) : (
    <span className="flex items-center gap-0.5 text-xs text-red-600">
      <TrendingDown className="h-3 w-3" />
      {formatPercent(Math.abs(delta))}
    </span>
  )
}

export function OverviewTab({ summary, chartData }: Props) {
  const { current, previous } = summary

  const kpis = [
    {
      label: 'Receita do mês',
      value: formatCurrency(current.revenue),
      delta: <DeltaBadge current={current.revenue} previous={previous.revenue} />,
    },
    {
      label: 'Custos do mês',
      value: formatCurrency(current.costs),
      delta: null,
    },
    {
      label: 'Lucro líquido',
      value: formatCurrency(current.profit),
      delta: <DeltaBadge current={current.profit} previous={previous.profit} />,
      className: current.profit < 0 ? 'text-red-600' : 'text-green-600',
    },
    {
      label: 'Margem líquida',
      value: formatPercent(current.margin),
      delta: null,
      className:
        current.margin < 20
          ? 'text-red-600'
          : current.margin < 40
            ? 'text-amber-600'
            : 'text-green-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`mt-1 text-xl font-bold ${kpi.className ?? ''}`}>{kpi.value}</p>
              {kpi.delta && <div className="mt-1">{kpi.delta}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Receita × Custos (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Sem dados financeiros ainda.
            </div>
          ) : (
            <RevenueCostChart data={chartData} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
