'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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

// Largura mínima por coluna na janela visível, antes de jogar um par de
// colunas (uma de cada lado) para fora.
const MIN_SLOT_PX = 52
const MIN_WINDOW = 5

export function ReceivedRevenueChart({ data, centerIndex, windowSize = 13 }: Props) {
  const [center, setCenter] = useState(centerIndex)

  // Mede a área de recorte para decidir quantas colunas cabem. A janela é
  // sempre ÍMPAR (coluna central + N de cada lado) e encolhe simetricamente
  // — joga uma coluna de cada lado fora — preservando a navegação 3-em-3.
  const clipRef = useRef<HTMLDivElement>(null)
  const [clipWidth, setClipWidth] = useState(0)
  useEffect(() => {
    const el = clipRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      setClipWidth(entries[0]?.contentRect.width ?? 0)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const effectiveWindow = useMemo(() => {
    const maxByProp = Math.min(windowSize, data.length)
    if (clipWidth <= 0) return maxByProp
    const fit = Math.floor(clipWidth / MIN_SLOT_PX)
    const odd = fit % 2 === 0 ? fit - 1 : fit
    return Math.max(MIN_WINDOW, Math.min(maxByProp, odd))
  }, [clipWidth, windowSize, data.length])

  const halfWindow = Math.floor(effectiveWindow / 2)
  // Bounds pelas bordas do array: a janela pode varrer do primeiro ao último
  // mês sem estourar. Independente do tamanho da janela, todos os meses
  // continuam alcançáveis pela navegação (importante quando a janela encolhe).
  const minAllowed = halfWindow
  const maxAllowed = Math.max(halfWindow, data.length - 1 - halfWindow)
  // Reclampa o centro sempre que a janela muda de tamanho (resize).
  const safeCenter = Math.min(Math.max(center, minAllowed), maxAllowed)

  // Global domain so the Y-axis never jumps while panning.
  const yDomain = useMemo<[number, number]>(() => {
    const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.costs)), 1)
    return [0, Math.ceil(maxVal * 1.1)]
  }, [data])

  const highlightLabel = data[centerIndex]?.month

  const canGoBack = safeCenter > minAllowed
  const canGoForward = safeCenter < maxAllowed

  // The inner chart is (data.length / effectiveWindow) times wider than the
  // clip container. translateX as % of inner width = -(first / N) * 100.
  const translatePct = -((safeCenter - halfWindow) / data.length) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Mês anterior"
          onClick={() => setCenter(Math.max(minAllowed, safeCenter - 3))}
          disabled={!canGoBack}
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1">
          {/* Y-axis rendered outside the clip area — stays fixed while chart pans. */}
          <RevenueCostYAxis data={data} yDomain={yDomain} />

          {/* Clipping window: hides bars outside the visible range. */}
          <div ref={clipRef} className="min-w-0 flex-1 overflow-hidden">
            {/* Inner chart: all months rendered once, navigation via CSS transform only. */}
            <div
              style={{
                width: `${(data.length / effectiveWindow) * 100}%`,
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
                downsampleToFit={false}
              />
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Próximo mês"
          onClick={() => setCenter(Math.min(maxAllowed, safeCenter + 3))}
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
