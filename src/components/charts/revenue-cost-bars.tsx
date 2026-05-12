'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART_COLORS, formatBRL, formatBRLCompact } from './chart-theme'

type Datum = { month: string; revenue: number; costs: number }

type Props = {
  data: Datum[]
  height?: number
}

export function RevenueCostBars({ data, height = 260 }: Props) {
  if (data.every((d) => d.revenue === 0 && d.costs === 0)) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem receitas ou custos no período.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatBRLCompact}
        />
        <Tooltip formatter={(v: number) => formatBRL(v)} />
        <Legend />
        <Bar dataKey="revenue" name="Receita" fill={CHART_COLORS.success} radius={[3, 3, 0, 0]} />
        <Bar dataKey="costs" name="Custos" fill={CHART_COLORS.danger} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
