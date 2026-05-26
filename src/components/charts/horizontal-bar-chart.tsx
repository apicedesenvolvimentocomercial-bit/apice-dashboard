'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CHART_COLORS, chartTooltipProps, formatBRL, formatBRLCompact } from './chart-theme'

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
  const maxValue = data.reduce((m, d) => (d.value > m ? d.value : m), 0)
  // Teto 30% acima do maior valor: barra nunca enche 100% da largura,
  // mantendo proporção entre clínicas (resolve "1 clínica = barra cheia").
  const xMax = maxValue > 0 ? maxValue * 1.3 : 1
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
          domain={[0, xMax]}
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
        <Tooltip {...chartTooltipProps} formatter={(v: number) => formatter(v)} />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 3, 3, 0]}
          animationDuration={300}
          // Espessura máxima da barra: com poucos itens (ex: 1 procedimento) o
          // Recharts engrossa a barra para preencher a altura — o teto mantém
          // uma faixa fina e legível em vez de um bloco gigante.
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
