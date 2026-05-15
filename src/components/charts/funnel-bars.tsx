'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART_COLORS } from './chart-theme'

type Datum = { stage: string; count: number; isWon: boolean; isLost: boolean }

type Props = {
  data: Datum[]
  height?: number
}

export function FunnelBars({ data, height = 240 }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Funil sem estágios.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="stage"
          tick={{ fontSize: 11 }}
          width={120}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} animationDuration={300}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.isWon
                  ? CHART_COLORS.success
                  : d.isLost
                    ? CHART_COLORS.danger
                    : CHART_COLORS.primary
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
