'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { CHART_PIE_PALETTE, formatBRL } from './chart-theme'

type Datum = { name: string; value: number }

type Props = {
  data: Datum[]
  height?: number
  /**
   * Como formatar valores no tooltip. Props serializável (não passar funções
   * pelo boundary Server → Client). Default: `currency` (BRL).
   */
  valueFormat?: 'currency' | 'count'
  /** Sufixo opcional quando `valueFormat='count'` (ex.: "leads"). */
  unitLabel?: string
}

const COUNT_FORMATTER = new Intl.NumberFormat('pt-BR')

export function SharePieChart({ data, height = 280, valueFormat = 'currency', unitLabel }: Props) {
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
