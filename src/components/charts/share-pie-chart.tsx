'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { CHART_PIE_PALETTE, formatBRL } from './chart-theme'

type Datum = { name: string; value: number }

type Props = {
  data: Datum[]
  height?: number
  formatter?: (value: number) => string
}

export function SharePieChart({ data, height = 280, formatter = formatBRL }: Props) {
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
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          innerRadius={50}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PIE_PALETTE[i % CHART_PIE_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => formatter(v)} />
        <Legend
          verticalAlign="bottom"
          wrapperStyle={{ fontSize: 11 }}
          iconSize={8}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
