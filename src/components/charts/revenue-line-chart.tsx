'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART_COLORS, formatBRL, formatBRLCompact } from './chart-theme'

type Datum = { month: string; revenue: number; previousYear?: number }

type Props = {
  data: Datum[]
  showPreviousYear?: boolean
  height?: number
}

export function RevenueLineChart({ data, showPreviousYear = true, height = 280 }: Props) {
  if (data.every((d) => d.revenue === 0 && (d.previousYear ?? 0) === 0)) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem dados de receita no período.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
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
        <Line
          type="monotone"
          dataKey="revenue"
          name="Este ano"
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          animationDuration={300}
        />
        {showPreviousYear && (
          <Line
            type="monotone"
            dataKey="previousYear"
            name="Ano anterior"
            stroke={CHART_COLORS.muted}
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
