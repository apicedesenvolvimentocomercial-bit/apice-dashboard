'use client'

import { BarChart3, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { compactK, formatBRL0 } from './format'

export type ChartMonth = { label: string; revenue: number; costs: number }

const WINDOW_COUNT = 8 // colunas visíveis (default do dashboard)
const STEP = 2 // meses por clique de seta
const COL_GAP = 16 // px entre colunas
const PLOT_H = 180 // altura do plot (default do dashboard)
const GUTTER = 22 // headroom p/ rótulos de topo

const PERIOD_OPTIONS = [1, 3, 6, 12]

/** Teto "bonito" p/ o eixo: 1/1.5/2/2.5/3/4/5/6/8/10 × 10^n. */
function niceMax(max: number): number {
  if (max <= 0) return 1
  const exp = Math.floor(Math.log10(max))
  const base = Math.pow(10, exp)
  const normalized = max / base
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const step = steps.find((s) => s >= normalized) ?? 10
  return step * base
}

/** "jan/2026" → "jan" (o ano completo vai no title/tooltip). */
function shortLabel(label: string): string {
  return label.split('/')[0] ?? label
}

type Props = {
  /** Receita GERADA × custos (competência) — 12 meses até o atual. */
  generated: ChartMonth[]
  /** Receita RECEBIDA × custos (caixa) — meses passados até o atual. */
  received: ChartMonth[]
  /** Visibilidade por cargo: com uma só série, o toggle some. */
  showGenerated: boolean
  showReceived: boolean
  /** Colunas visíveis na janela (Financeiro usa 12 — handoff §5.3). */
  windowCount?: number
  /** Altura do plot em px (Financeiro usa 220 — handoff §5.3). */
  plotHeight?: number
}

/**
 * Gráfico "Receita × Custos" do redesign (handoff §6): barras CSS com janela
 * de 8 colunas, navegação por translateX (não redimensiona), toggle segmented
 * "Gerada | Recebida" e popover de amostragem (1/3/6/12 meses + personalizado).
 * Colunas têm largura FIXA a partir de 6 meses; com menos, centraliza.
 */
export function RevenueCostChart({
  generated,
  received,
  showGenerated,
  showReceived,
  windowCount = WINDOW_COUNT,
  plotHeight = PLOT_H,
}: Props) {
  const barArea = plotHeight - GUTTER // px úteis p/ as barras
  const [mode, setMode] = useState<'gerada' | 'recebida'>(showGenerated ? 'gerada' : 'recebida')
  const active = mode === 'gerada' && showGenerated ? 'gerada' : 'recebida'
  const series = active === 'gerada' ? generated : received
  const total = series.length

  const [period, setPeriod] = useState(Math.min(12, total || 12))
  const [popOpen, setPopOpen] = useState(false)
  // Índice do 1º slot visível dentro da fatia do período (esquerda).
  const [start, setStart] = useState<number | null>(null) // null = fim (mais recentes)

  const p = Math.min(Math.max(1, period), Math.max(1, total))
  const slice = useMemo(() => series.slice(total - p, total), [series, total, p])
  const visCount = Math.min(p, windowCount)
  const d = Math.max(visCount, 6) // divisor: coluna fixa a partir de 6
  const maxStart = Math.max(0, p - visCount)
  const startIdx = start == null ? maxStart : Math.min(Math.max(0, start), maxStart)

  const scaleMax = useMemo(
    () => niceMax(Math.max(...slice.map((m) => Math.max(m.revenue, m.costs)), 0)),
    [slice]
  )
  const allZero = slice.every((m) => m.revenue === 0 && m.costs === 0)

  const hasToggle = showGenerated && showReceived
  const revName = active === 'gerada' ? 'Receita gerada' : 'Receita recebida'

  const slotWidth = `calc((100% - ${(d - 1) * COL_GAP}px) / ${d})`
  const rowTransform = `translateX(calc(${-startIdx} * (((100% - ${(d - 1) * COL_GAP}px) / ${d}) + ${COL_GAP}px)))`
  const rowStyle: React.CSSProperties = {
    gap: COL_GAP,
    transform: rowTransform,
    transition: 'transform 460ms cubic-bezier(0.22,1,0.36,1)',
    justifyContent: p < 6 ? 'center' : undefined,
  }

  function selectPeriod(n: number, keepOpen = false) {
    setPeriod(Math.min(Math.max(1, n), Math.max(1, total)))
    setStart(null) // volta aos meses mais recentes
    if (!keepOpen) setPopOpen(false)
  }

  function switchMode(next: 'gerada' | 'recebida') {
    setMode(next)
    setStart(null)
  }

  const isCustom = !PERIOD_OPTIONS.includes(p)

  return (
    <div className="relative flex h-full flex-col rounded-[13px] border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-[16.5px] font-semibold">
          Receita {active === 'gerada' ? 'gerada' : 'recebida'} × Custos
        </h2>
        <div className="flex items-center gap-2">
          {hasToggle && (
            <div
              className="relative grid auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]"
              role="tablist"
              aria-label="Tipo de receita"
            >
              <div
                className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-primary shadow-card transition-transform duration-340 ease-senno"
                style={{
                  width: 'calc((100% - 6px) / 2)',
                  transform: `translateX(${active === 'gerada' ? 0 : 100}%)`,
                }}
                aria-hidden="true"
              />
              {(
                [
                  { key: 'gerada', label: 'Gerada' },
                  { key: 'recebida', label: 'Recebida' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active === opt.key}
                  onClick={() => switchMode(opt.key)}
                  className={cn(
                    'relative z-[1] whitespace-nowrap rounded-[7px] px-3 py-1 text-xs font-semibold transition-colors duration-250',
                    active === opt.key ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Botão + popover de amostragem (handoff §6.3) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPopOpen((o) => !o)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border bg-card px-[11px] text-[12.5px] font-semibold text-foreground transition-colors hover:border-primary/50"
            >
              <Calendar className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
              {p === 1 ? '1 mês' : `${p} meses`}
              <ChevronDown className="h-[13px] w-[13px] text-muted-foreground" aria-hidden="true" />
            </button>
            {popOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPopOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-[38px] z-[31] w-[194px] rounded-[11px] border border-border bg-card p-[7px] shadow-[0_10px_28px_hsl(var(--shadow)/0.20)]">
                  <div className="px-2 pb-[7px] pt-[5px] text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    Amostragem por período
                  </div>
                  {PERIOD_OPTIONS.map((n) => {
                    const disabled = n > total
                    const selected = p === n
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectPeriod(n)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[7px] px-[9px] py-2 text-[13px] transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40',
                          selected && 'font-semibold text-primary-text'
                        )}
                      >
                        {n === 1 ? '1 mês' : `${n} meses`}
                        {selected && (
                          <Check className="h-[15px] w-[15px] text-primary-text" aria-hidden />
                        )}
                      </button>
                    )
                  })}
                  <div className="mx-1 my-1.5 h-px bg-border" />
                  <div
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-[7px] px-[9px] py-1.5',
                      isCustom && 'bg-accent'
                    )}
                  >
                    <span className="text-[13px]">Personalizado</span>
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={total}
                        value={p}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n) && n >= 1) selectPeriod(n, true)
                        }}
                        aria-label="Meses (personalizado)"
                        className="h-7 w-[52px] rounded-[7px] border border-input bg-background text-center text-[13px] tabular-nums outline-none focus:border-[hsl(var(--ring))]"
                      />
                      <span className="text-xs text-muted-foreground">m</span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {allZero ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
          <BarChart3
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Sem lançamentos no período</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            Receitas e custos lançados aparecem aqui mês a mês.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          {/* [ eixo Y ] [ ‹ ] [ plot ] [ › ] */}
          <div className="flex items-stretch gap-2.5">
            <div
              className="flex w-[46px] flex-none flex-col justify-between text-right text-[10px] tabular-nums text-muted-foreground"
              style={{ paddingTop: GUTTER }}
              aria-hidden="true"
            >
              {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                <span key={f}>R$ {compactK(scaleMax * f)}</span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStart(Math.max(0, startIdx - STEP))}
              disabled={startIdx === 0}
              aria-label="Meses anteriores"
              className="h-[30px] w-[30px] flex-none self-center rounded-full border border-border bg-card transition-colors hover:border-primary/50 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1">
              <div
                className="relative overflow-hidden border-b border-border"
                style={{ height: plotHeight }}
              >
                {/* Gridlines tracejadas sobre a área útil */}
                {[1, 0.75, 0.5, 0.25].map((f) => (
                  <div
                    key={f}
                    className="absolute inset-x-0 border-t border-dashed border-border"
                    style={{ bottom: Math.round(barArea * f) }}
                    aria-hidden="true"
                  />
                ))}
                <div
                  className="absolute inset-x-0 bottom-0 flex items-end"
                  style={{ ...rowStyle, height: barArea }}
                >
                  {slice.map((m, i) => {
                    const revPct = Math.min(m.revenue / scaleMax, 1) * 100
                    const costPct = Math.min(m.costs / scaleMax, 1) * 100
                    const revTaller = revPct >= costPct
                    return (
                      <div
                        key={`${m.label}-${i}`}
                        className="relative flex h-full flex-none items-end gap-[3px]"
                        style={{ width: slotWidth }}
                      >
                        <div
                          className="relative h-full flex-1"
                          title={`${revName} · ${m.label}: ${formatBRL0(m.revenue)}`}
                        >
                          {m.revenue > 0 && (
                            <span
                              className="absolute inset-x-0 -translate-y-[2px] text-center text-[9px] font-semibold tabular-nums text-primary-text"
                              style={{ bottom: `${revPct}%` }}
                            >
                              {compactK(m.revenue)}
                            </span>
                          )}
                          <div
                            className="absolute inset-x-0 bottom-0 bg-primary"
                            style={{
                              height: `${revPct}%`,
                              borderRadius: revTaller ? '4px 4px 0 0' : '4px 0 0 0',
                            }}
                          />
                        </div>
                        <div
                          className="relative h-full flex-1"
                          title={`Custos · ${m.label}: ${formatBRL0(m.costs)}`}
                        >
                          {m.costs > 0 && (
                            <span
                              className="absolute inset-x-0 -translate-y-[2px] text-center text-[9px] font-semibold tabular-nums text-destructive"
                              style={{ bottom: `${costPct}%` }}
                            >
                              {compactK(m.costs)}
                            </span>
                          )}
                          <div
                            className="absolute inset-x-0 bottom-0 bg-destructive/85"
                            style={{
                              height: `${costPct}%`,
                              borderRadius: revTaller ? '0 4px 0 0' : '4px 4px 0 0',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Rótulos de mês — mesma janela/transform do plot */}
              <div className="overflow-hidden">
                <div className="flex" style={rowStyle}>
                  {slice.map((m, i) => (
                    <span
                      key={`${m.label}-${i}`}
                      title={m.label}
                      className="flex-none pt-1 text-center text-[10.5px] text-muted-foreground"
                      style={{ width: slotWidth }}
                    >
                      {shortLabel(m.label)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStart(Math.min(maxStart, startIdx + STEP))}
              disabled={startIdx >= maxStart}
              aria-label="Meses seguintes"
              className="h-[30px] w-[30px] flex-none self-center rounded-full border border-border bg-card transition-colors hover:border-primary/50 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Legenda */}
          <div className="mt-3.5 flex items-center justify-center gap-[22px] text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px] bg-primary" aria-hidden="true" />
              {revName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px] bg-destructive/85"
                aria-hidden="true"
              />
              Custos
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
