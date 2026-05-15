'use client'

import { Line, LineChart, ResponsiveContainer } from 'recharts'

import { CHART_COLORS } from './chart-theme'

type Props = {
  data: { value: number }[]
  color?: string
  height?: number
}

export function Sparkline({ data, color = CHART_COLORS.primary, height = 40 }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
