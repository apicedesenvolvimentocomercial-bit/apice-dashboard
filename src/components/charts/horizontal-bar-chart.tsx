'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CHART_COLORS, formatBRL, formatBRLCompact } from './chart-theme'

type Props = {
  data: { label: string; value: number }[]
  height?: number
  formatter?: (value: number) => string
  color?: string
}

export function HorizontalBarChart({
  data,
  height = 280,
  formatter = (v) => formatBRL(v),
  color = CHART_COLORS.primary,
}: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem dados no período.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatBRLCompact}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11 }}
          width={140}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip formatter={(v: number) => formatter(v)} />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
