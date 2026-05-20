'use client'

import { useEffect, useRef, useState } from 'react'
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

export type Datum = { month: string; revenue: number; costs: number }

type Props = {
  data: Datum[]
  height?: number
  revenueName?: string
  highlightLabel?: string
  showYAxis?: boolean
  showLegend?: boolean
  yDomain?: [number, number]
}

const HIGHLIGHT_TICK = '#2563eb'

// Largura reservada para o eixo Y (usada no componente estático e no chart principal).
export const YAXIS_WIDTH = 60

function buildMonthTick(highlight: string | undefined) {
  return function MonthTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
    const value = props.payload?.value ?? ''
    const isHighlight = highlight != null && value === highlight
    return (
      <text
        x={props.x}
        y={(props.y ?? 0) + 14}
        textAnchor="middle"
        fontSize={11}
        fontWeight={400}
        fill={isHighlight ? HIGHLIGHT_TICK : 'currentColor'}
      >
        {value}
      </text>
    )
  }
}

export function RevenueCostBars({
  data,
  height = 260,
  revenueName = 'Receita',
  highlightLabel,
  showYAxis = true,
  showLegend = true,
  yDomain,
}: Props) {
  // Mede a largura renderizada para decidir entre rótulos horizontais e
  // inclinados. Cada rótulo ("mai/26") precisa de ~42px sem sobrepor.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      setBoxWidth(entries[0]?.contentRect.width ?? 0)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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

  // Largura disponível pro eixo X (desconta a coluna do eixo Y, quando visível).
  // Os rótulos ficam sempre retos; conforme a tela encolhe, mostramos menos
  // deles (pulamos índices que não cabem) em vez de inclinar ou sobrepor.
  // Cada rótulo ("mai/26") precisa de ~46px.
  const MIN_LABEL_PX = 46
  const plotWidth = Math.max(0, boxWidth - (showYAxis ? YAXIS_WIDTH + 8 : 0))
  const maxLabels = plotWidth > 0 ? Math.max(1, Math.floor(plotWidth / MIN_LABEL_PX)) : data.length
  // interval = quantos ticks pular entre rótulos visíveis (0 = mostra todos).
  const tickInterval = data.length > maxLabels ? Math.ceil(data.length / maxLabels) - 1 : 0

  const MonthTick = buildMonthTick(highlightLabel)

  return (
    <div ref={wrapRef}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: showYAxis ? 8 : 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="month"
            tick={MonthTick}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
          />
          {showYAxis ? (
            <YAxis
              domain={yDomain}
              width={YAXIS_WIDTH}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatBRLCompact}
            />
          ) : (
            // Eixo oculto mantém o domínio Y consistente com o eixo estático externo.
            <YAxis hide domain={yDomain} width={0} />
          )}
          <Tooltip cursor={false} formatter={(v: number) => formatBRL(v)} />
          {showLegend && <Legend />}
          <Bar
            dataKey="revenue"
            name={revenueName}
            fill={CHART_COLORS.success}
            radius={[3, 3, 0, 0]}
            animationDuration={300}
          />
          <Bar
            dataKey="costs"
            name="Custos"
            fill={CHART_COLORS.danger}
            radius={[3, 3, 0, 0]}
            animationDuration={300}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Eixo Y estático — renderizado fora do container deslizante para não se mover
 * durante a animação. Usa o mesmo domínio e configurações do RevenueCostBars.
 */
export function RevenueCostYAxis({
  data,
  yDomain,
  height = 260,
}: {
  data: Datum[]
  yDomain: [number, number]
  height?: number
}) {
  return (
    // margin.left (8) + YAXIS_WIDTH (60) + folga mínima (4) = 72px
    <div style={{ width: YAXIS_WIDTH + 12, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 8, bottom: 0 }}>
          {/* XAxis oculto com mesma altura reservada que o chart principal (30px). */}
          <XAxis dataKey="month" hide height={30} />
          <YAxis
            domain={yDomain}
            width={YAXIS_WIDTH}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatBRLCompact}
          />
          {/* Barras transparentes garantem o mesmo cálculo de domínio. */}
          <Bar dataKey="revenue" fill="transparent" animationDuration={300} />
          <Bar dataKey="costs" fill="transparent" animationDuration={300} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
