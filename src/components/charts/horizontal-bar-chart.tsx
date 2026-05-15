'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CHART_COLORS, formatBRL, formatBRLCompact } from './chart-theme'

type Props = {
  data: { label: string; value: number }[]
  height?: number
  /**
   * Como formatar valores no tooltip. Serializável para atravessar
   * o boundary Server → Client. Default: `currency` (BRL).
   */
  valueFormat?: 'currency' | 'count'
  unitLabel?: string
  color?: string
}

const COUNT_FORMATTER = new Intl.NumberFormat('pt-BR')

export function HorizontalBarChart({
  data,
  height = 280,
  valueFormat = 'currency',
  unitLabel,
  color = CHART_COLORS.primary,
}: Props) {
  const formatter = (v: number) =>
    valueFormat === 'count'
      ? unitLabel
        ? `${COUNT_FORMATTER.format(v)} ${unitLabel}`
        : COUNT_FORMATTER.format(v)
      : formatBRL(v)
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
          tickFormatter={(v: number) =>
            valueFormat === 'count' ? COUNT_FORMATTER.format(v) : formatBRLCompact(v)
          }
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
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} animationDuration={300} />
      </BarChart>
    </ResponsiveContainer>
  )
}
