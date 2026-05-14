'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

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

const EXIT_MS = 60 // fade-out do conteúdo atual
const HOLD_MS = 30 // janela escura: React comita os novos dados invisível
const ENTER_MS = 190 // slide + fade-in dos novos dados
const COOLDOWN_MS = 180

export function ReceivedRevenueChart({ data, centerIndex, windowSize = 13 }: Props) {
  const halfWindow = Math.floor(windowSize / 2)
  const minCenter = halfWindow
  const maxCenter = data.length - 1 - halfWindow
  const safeInitial = Math.min(Math.max(centerIndex, minCenter), maxCenter)

  // center: mês exibido no centro do gráfico (atualiza a cada passo da fila).
  const [center, setCenter] = useState(safeInitial)

  // effectiveCenter: centro após todos os moves na fila — controla enable/disable dos botões.
  const effectiveCenterRef = useRef(safeInitial)
  const [effectiveCenterDisplay, setEffectiveCenterDisplay] = useState(safeInitial)

  const slideRef = useRef<HTMLDivElement>(null)
  const queue = useRef<Array<'back' | 'forward'>>([])
  const isAnimating = useRef(false)
  const lastClickTime = useRef(0)

  const visible = useMemo(
    () => data.slice(center - halfWindow, center + halfWindow + 1),
    [data, center, halfWindow]
  )

  // Domínio global: usa todos os dados para o eixo Y não pular ao navegar.
  const yDomain = useMemo<[number, number]>(() => {
    const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.costs)), 1)
    return [0, Math.ceil(maxVal * 1.1)]
  }, [data])

  const highlightLabel = data[centerIndex]?.month

  // Navegação bloqueada se o mês atual sair da janela visível.
  const canGoBack =
    effectiveCenterDisplay > minCenter && effectiveCenterDisplay > centerIndex - halfWindow
  const canGoForward =
    effectiveCenterDisplay < maxCenter && effectiveCenterDisplay < centerIndex + halfWindow

  // processQueueRef: atualizado a cada render para evitar closures velhas.
  const processQueueRef = useRef<() => void>(() => {})
  processQueueRef.current = () => {
    if (queue.current.length === 0) {
      isAnimating.current = false
      return
    }
    const dir = queue.current.shift()!
    const el = slideRef.current

    if (!el) {
      setCenter((c) => (dir === 'back' ? Math.max(minCenter, c - 1) : Math.min(maxCenter, c + 1)))
      processQueueRef.current()
      return
    }

    const dist = el.getBoundingClientRect().width / windowSize
    const startX = dir === 'back' ? -(dist * 0.6) : dist * 0.6

    // Fase 1: fade-out do conteúdo atual.
    const exitAnim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: EXIT_MS,
      easing: 'ease-in',
    })

    exitAnim.onfinish = () => {
      // Pina opacity=0 via inline style ANTES do React re-renderizar.
      // Inline style persiste mesmo que o browser descarte o estado da animação
      // durante o commit do recharts — isso elimina o flash.
      el.style.opacity = '0'

      // Atualiza os dados enquanto o elemento está invisível.
      setCenter((c) => (dir === 'back' ? Math.max(minCenter, c - 1) : Math.min(maxCenter, c + 1)))

      // Aguarda o React comitar o re-render antes de iniciar a entrada.
      setTimeout(() => {
        // Fase 2: slide + fade-in. A animação sobrescreve o inline style enquanto roda.
        const enterAnim = el.animate(
          [
            { opacity: 0, transform: `translateX(${startX}px)` },
            { opacity: 1, transform: 'translateX(0)' },
          ],
          { duration: ENTER_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        )

        enterAnim.onfinish = () => {
          el.style.opacity = '' // Libera o pin — animação acabou, elemento visível.
          processQueueRef.current()
        }
      }, HOLD_MS)
    }
  }

  const enqueue = (dir: 'back' | 'forward') => {
    const now = Date.now()
    if (now - lastClickTime.current < COOLDOWN_MS) return
    lastClickTime.current = now

    const next = dir === 'back' ? effectiveCenterRef.current - 1 : effectiveCenterRef.current + 1
    const withinBounds =
      dir === 'back'
        ? next >= minCenter && next >= centerIndex - halfWindow
        : next <= maxCenter && next <= centerIndex + halfWindow
    if (!withinBounds) return

    effectiveCenterRef.current = next
    setEffectiveCenterDisplay(next)
    queue.current.push(dir)

    if (!isAnimating.current) {
      isAnimating.current = true
      processQueueRef.current()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Mês anterior"
          onClick={() => enqueue('back')}
          disabled={!canGoBack}
          className="h-8 w-8 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1">
          {/* Eixo Y estático — fora do slideRef, não se move durante a animação. */}
          <RevenueCostYAxis data={visible} yDomain={yDomain} />

          {/* Área deslizante: só barras + labels do eixo X. */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div ref={slideRef} className="will-change-transform">
              <RevenueCostBars
                data={visible}
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
          onClick={() => enqueue('forward')}
          disabled={!canGoForward}
          className="h-8 w-8 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legenda estática — fora do container deslizante, nunca se move. */}
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
