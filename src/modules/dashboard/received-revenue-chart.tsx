'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { CHART_COLORS } from '@/components/charts/chart-theme'
import { RevenueCostBars, RevenueCostYAxis } from '@/components/charts/revenue-cost-bars'
import { Button } from '@/components/ui/button'

export type ReceivedMonth = {
  month: string
  revenue: number
  costs: number
  isFuture: boolean
}

type Props = {
  data: ReceivedMonth[]
  centerIndex: number
  windowSize?: number
}

export function ReceivedRevenueChart({ data, centerIndex, windowSize = 13 }: Props) {
  const halfWindow = Math.floor(windowSize / 2)
  // Absolute bounds: window can't overflow the array.
  const minAllowed = Math.max(halfWindow, centerIndex - halfWindow)
  const maxAllowed = Math.min(data.length - 1 - halfWindow, centerIndex + halfWindow)
  const safeInitial = Math.min(Math.max(centerIndex, minAllowed), maxAllowed)

  const [center, setCenter] = useState(safeInitial)

  // Global domain so the Y-axis never jumps while panning.
  const yDomain = useMemo<[number, number]>(() => {
    const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.costs)), 1)
    return [0, Math.ceil(maxVal * 1.1)]
  }, [data])

  const highlightLabel = data[centerIndex]?.month

  const canGoBack = center > minAllowed
  const canGoForward = center < maxAllowed

  // The inner chart is (data.length / windowSize) times wider than the clip container.
  // translateX as % of inner width = -(firstVisibleBar / data.length) * 100.
  // Math: -(first / N) * (N/K * W) = -(first / K) * W = -first bar-widths. ✓
  const translatePct = -((center - halfWindow) / data.length) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Mês anterior"
          onClick={() => setCenter((c) => Math.max(minAllowed, c - 3))}
          disabled={!canGoBack}
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1">
          {/* Y-axis rendered outside the clip area — stays fixed while chart pans. */}
          <RevenueCostYAxis data={data} yDomain={yDomain} />

          {/* Clipping window: hides bars outside the visible range. */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {/* Inner chart: all months rendered once, navigation via CSS transform only. */}
            <div
              style={{
                width: `${(data.length / windowSize) * 100}%`,
                transform: `translateX(${translatePct}%)`,
                transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
                willChange: 'transform',
              }}
            >
              <RevenueCostBars
                data={data}
                revenueName="Receita recebida"
                highlightLabel={highlightLabel}
                showYAxis={false}
                showLegend={false}
                yDomain={yDomain}
              />
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Próximo mês"
          onClick={() => setCenter((c) => Math.min(maxAllowed, c + 3))}
          disabled={!canGoForward}
          className="h-8 w-8 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-6">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-[10px] w-[10px] rounded-[2px]"
            style={{ backgroundColor: CHART_COLORS.success }}
          />
          Receita recebida
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-[10px] w-[10px] rounded-[2px]"
            style={{ backgroundColor: CHART_COLORS.danger }}
          />
          Custos
        </span>
      </div>
    </div>
  )
}
