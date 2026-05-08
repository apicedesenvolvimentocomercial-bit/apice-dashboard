'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

import type { ChartMonth } from './types'

type Props = { data: ChartMonth[] }

export function RevenueCostChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            new Intl.NumberFormat('pt-BR', {
              notation: 'compact',
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            }).format(v)
          }
        />
        <Tooltip
          formatter={(value: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
          }
        />
        <Legend />
        <Bar dataKey="revenue" name="Receita" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="costs" name="Custos" fill="#f43f5e" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
