'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import { spDayKey } from '@/lib/date'
import { cn } from '@/lib/utils'

/**
 * Calendário próprio (design.md) — substitui o popup NATIVO do
 * `input[type="date"]`, que não é estilizável: ele chega com fim-de-semana em
 * vermelho, tipografia do SO e um `<select>` de mês fora do nosso chrome.
 *
 * Sem dependência nova: grade calculada aqui, tokens semânticos, dois dourados
 * nos papéis certos (`bg-primary` superfície p/ o dia selecionado,
 * `text-primary-text` p/ hoje) e `tabular-nums` nos números.
 *
 * Toda a aritmética é feita sobre a string "YYYY-MM-DD" e sobre componentes
 * Y/M/D — nunca `new Date(iso)` (que parseia como UTC e desloca o dia). Os
 * `new Date(y, m, d)` internos só servem p/ contar dias/dia-da-semana, e nada
 * do resultado vira instante — então não há conversão de fuso envolvida.
 */

// ─── pt-BR (app é monolíngue; array literal > Intl p/ ser determinístico) ─────

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const WEEKDAYS_FULL = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const
const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

// ─── datas como Y/M/D (m = 0-11) ─────────────────────────────────────────────

type Ymd = { y: number; m: number; d: number }

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate() // dia 0 do mês seguinte = último do alvo
}

function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1).getDay() // 0 = domingo
}

function toIso({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseIso(iso?: string | null): Ymd | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  if (m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null
  return { y, m, d }
}

function shiftDays(ymd: Ymd, delta: number): Ymd {
  const dt = new Date(ymd.y, ymd.m, ymd.d + delta)
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() }
}

function shiftMonths(ymd: Ymd, delta: number): Ymd {
  const y = ymd.y + Math.floor((ymd.m + delta) / 12)
  const m = (((ymd.m + delta) % 12) + 12) % 12
  return { y, m, d: Math.min(ymd.d, daysInMonth(y, m)) }
}

/** ISO ordena lexicograficamente — comparação de datas é comparação de string. */
function outOfRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return true
  if (max && iso > max) return true
  return false
}

// ─── átomos visuais ──────────────────────────────────────────────────────────

const NAV_BUTTON_CLASS =
  'inline-flex h-7 w-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'

/** Célula quadrada da grade de dias e das grades de mês/ano. */
const CELL_CLASS =
  'inline-flex items-center justify-center rounded-lg text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none'

type Panel = 'days' | 'months' | 'years'

export type CalendarProps = {
  /** Dia selecionado em "YYYY-MM-DD" (vazio = nenhum). */
  value?: string
  /** Chamado com o ISO do dia clicado. */
  onSelect: (iso: string) => void
  /** Quando presente, mostra o botão "Limpar" (só com `value` preenchido). */
  onClear?: () => void
  /** Limites inclusivos em "YYYY-MM-DD". */
  min?: string
  max?: string
  /** Mês inicial quando não há `value` — default: mês de hoje. */
  defaultMonth?: string
  /** Põe o foco no dia selecionado/hoje ao montar (uso: abertura por teclado). */
  autoFocusDay?: boolean
  className?: string
}

export function Calendar({
  value,
  onSelect,
  onClear,
  min,
  max,
  defaultMonth,
  autoFocusDay,
  className,
}: CalendarProps) {
  const todayIso = React.useMemo(() => spDayKey(new Date()), [])
  const selected = parseIso(value)

  const initial = selected ?? parseIso(defaultMonth) ?? parseIso(todayIso)!
  const [view, setView] = React.useState<{ y: number; m: number }>({
    y: initial.y,
    m: initial.m,
  })
  const [panel, setPanel] = React.useState<Panel>('days')
  const [yearPage, setYearPage] = React.useState(() => Math.floor(initial.y / 12) * 12)
  const [dir, setDir] = React.useState<1 | -1>(1)

  // Foco itinerante (roving tabindex): um único dia tabulável por vez. Só
  // movemos o foco do DOM quando a navegação veio do teclado — senão a abertura
  // do popover roubaria o foco do campo com máscara, que é a via principal.
  const [focusIso, setFocusIso] = React.useState(() => value || todayIso)
  const grabFocus = React.useRef(false)
  const gridRef = React.useRef<HTMLDivElement>(null)

  // Um `value` novo vindo de fora (digitação na máscara) reposiciona a grade.
  React.useEffect(() => {
    const next = parseIso(value)
    if (!next) return
    setFocusIso(toIso(next))
    setView((current) =>
      current.y === next.y && current.m === next.m ? current : { y: next.y, m: next.m }
    )
  }, [value])

  React.useEffect(() => {
    if (!grabFocus.current) return
    grabFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus()
  }, [focusIso, view])

  // Foco inicial no dia selecionado/hoje. Em rAF p/ vencer o FocusScope do
  // Radix, que reposiciona o foco logo depois de montar o popover.
  React.useEffect(() => {
    if (!autoFocusDay) return
    const id = requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goToMonth(delta: number) {
    setDir(delta > 0 ? 1 : -1)
    setView((current) => {
      const next = shiftMonths({ ...current, d: 1 }, delta)
      return { y: next.y, m: next.m }
    })
  }

  function moveFocus(delta: number) {
    const from = parseIso(focusIso) ?? initial
    const next = shiftDays(from, delta)
    grabFocus.current = true
    setFocusIso(toIso(next))
    if (next.y !== view.y || next.m !== view.m) {
      setDir(delta > 0 ? 1 : -1)
      setView({ y: next.y, m: next.m })
    }
  }

  function moveFocusMonths(delta: number) {
    const from = parseIso(focusIso) ?? initial
    const next = shiftMonths(from, delta)
    grabFocus.current = true
    setFocusIso(toIso(next))
    setDir(delta > 0 ? 1 : -1)
    setView({ y: next.y, m: next.m })
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const from = parseIso(focusIso) ?? initial
    switch (e.key) {
      case 'ArrowLeft':
        moveFocus(-1)
        break
      case 'ArrowRight':
        moveFocus(1)
        break
      case 'ArrowUp':
        moveFocus(-7)
        break
      case 'ArrowDown':
        moveFocus(7)
        break
      case 'Home':
        moveFocus(-new Date(from.y, from.m, from.d).getDay())
        break
      case 'End':
        moveFocus(6 - new Date(from.y, from.m, from.d).getDay())
        break
      case 'PageUp':
        moveFocusMonths(-1)
        break
      case 'PageDown':
        moveFocusMonths(1)
        break
      default:
        return
    }
    e.preventDefault()
  }

  // Grade sempre com 6 semanas: a altura do popover não "pula" ao trocar de mês.
  const days = React.useMemo(() => {
    const lead = firstWeekday(view.y, view.m)
    const start = shiftDays({ y: view.y, m: view.m, d: 1 }, -lead)
    return Array.from({ length: 42 }, (_, i) => shiftDays(start, i))
  }, [view])

  // Seta desabilitada só quando o mês INTEIRO cai fora da faixa.
  const prevMonth = shiftMonths({ ...view, d: 1 }, -1)
  const nextMonth = shiftMonths({ ...view, d: 1 }, 1)
  const prevMonthDisabled =
    !!min && toIso({ ...prevMonth, d: daysInMonth(prevMonth.y, prevMonth.m) }) < min
  const nextMonthDisabled = !!max && toIso({ ...nextMonth, d: 1 }) > max
  const todayDisabled = outOfRange(todayIso, min, max)

  const captionId = React.useId()
  const slide = dir > 0 ? 'slide-in-from-right-2' : 'slide-in-from-left-2'

  // As setas mudam a unidade do painel visível: mês → ano → página de 12 anos.
  const NAV = {
    days: { prev: 'Mês anterior', next: 'Próximo mês', step: (d: number) => goToMonth(d) },
    months: {
      prev: 'Ano anterior',
      next: 'Próximo ano',
      step: (d: number) => setView((c) => ({ ...c, y: c.y + d })),
    },
    years: {
      prev: 'Anos anteriores',
      next: 'Próximos anos',
      step: (d: number) => setYearPage((p) => p + d * 12),
    },
  }[panel]

  /** Caption cicla dias → meses → anos → dias, sincronizando a página de anos. */
  function cyclePanel() {
    setPanel((p) => {
      if (p === 'days') return 'months'
      if (p === 'months') {
        setYearPage(Math.floor(view.y / 12) * 12)
        return 'years'
      }
      return 'days'
    })
  }

  return (
    <div className={cn('w-[17.25rem] select-none p-3', className)}>
      {/* ── cabeçalho: ‹ mês/ano › — o rótulo abre os painéis de salto ── */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className={NAV_BUTTON_CLASS}
          onClick={() => NAV.step(-1)}
          disabled={panel === 'days' && prevMonthDisabled}
          aria-label={NAV.prev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          id={captionId}
          onClick={cyclePanel}
          aria-live="polite"
          className="flex-1 rounded-md px-2 py-1 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {panel === 'days' && `${MONTHS[view.m]} de ${view.y}`}
          {panel === 'months' && view.y}
          {panel === 'years' && `${yearPage} – ${yearPage + 11}`}
        </button>

        <button
          type="button"
          className={NAV_BUTTON_CLASS}
          onClick={() => NAV.step(1)}
          disabled={panel === 'days' && nextMonthDisabled}
          aria-label={NAV.next}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Altura fixa = a da grade de 6 semanas (28 cabeçalho + 4 + 226 grade):
          trocar de painel (dias/meses/anos) não redimensiona o popover. */}
      <div className="h-[258px] overflow-hidden">
        {/* ── painel de dias ── */}
        {panel === 'days' && (
          <div
            key={`${view.y}-${view.m}`}
            className={cn('duration-160 animate-in fade-in-0', slide)}
          >
            <div className="mb-1 grid grid-cols-7">
              {WEEKDAYS.map((wd, i) => (
                <abbr
                  key={wd}
                  title={WEEKDAYS_FULL[i]}
                  className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground no-underline"
                >
                  {wd}
                </abbr>
              ))}
            </div>

            {/* Roving tabindex (padrão APG): o container NÃO é focável — o
                foco vive na célula, e é nela que o teclado é tratado. */}
            <div
              ref={gridRef}
              role="grid"
              aria-labelledby={captionId}
              className="grid grid-cols-7 gap-y-0.5"
            >
              {days.map((day) => {
                const iso = toIso(day)
                const outside = day.m !== view.m
                const isSelected = !!selected && iso === toIso(selected)
                const isToday = iso === todayIso
                const disabled = outOfRange(iso, min, max)
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-iso={iso}
                    tabIndex={iso === focusIso ? 0 : -1}
                    disabled={disabled}
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${day.d} de ${MONTHS[day.m]} de ${day.y}`}
                    onKeyDown={handleGridKeyDown}
                    onClick={() => {
                      setFocusIso(iso)
                      onSelect(iso)
                    }}
                    className={cn(
                      CELL_CLASS,
                      'h-9 w-9 justify-self-center',
                      // ordem importa: selecionado vence hoje, que vence fora-do-mês
                      disabled && 'text-muted-foreground/35',
                      !disabled && !isSelected && 'hover:bg-accent',
                      !disabled && !isSelected && outside && 'text-muted-foreground/45',
                      !disabled && !isSelected && !outside && 'text-foreground',
                      !disabled &&
                        !isSelected &&
                        isToday &&
                        'bg-primary/10 font-semibold text-primary-text',
                      isSelected &&
                        'bg-primary font-semibold text-primary-foreground hover:brightness-105'
                    )}
                  >
                    {day.d}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── salto rápido: meses ── */}
        {panel === 'months' && (
          <div className="grid h-full grid-cols-3 content-center gap-1 duration-160 animate-in fade-in-0">
            {MONTHS_SHORT.map((label, m) => {
              const isCurrent = m === view.m
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setView((c) => ({ ...c, m }))
                    setPanel('days')
                  }}
                  aria-label={MONTHS[m]}
                  className={cn(
                    CELL_CLASS,
                    'h-11 w-full capitalize',
                    isCurrent
                      ? 'bg-primary font-semibold text-primary-foreground hover:brightness-105'
                      : 'text-foreground hover:bg-accent'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── salto rápido: anos ── */}
        {panel === 'years' && (
          <div className="grid h-full grid-cols-3 content-center gap-1 duration-160 animate-in fade-in-0">
            {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => {
              const isCurrent = y === view.y
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setView((c) => ({ ...c, y }))
                    setPanel('months')
                  }}
                  className={cn(
                    CELL_CLASS,
                    'h-11 w-full',
                    isCurrent
                      ? 'bg-primary font-semibold text-primary-foreground hover:brightness-105'
                      : 'text-foreground hover:bg-accent'
                  )}
                >
                  {y}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── rodapé: atalhos ── */}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          disabled={todayDisabled}
          onClick={() => {
            const today = parseIso(todayIso)!
            setView({ y: today.y, m: today.m })
            setPanel('days')
            setFocusIso(todayIso)
            onSelect(todayIso)
          }}
          className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-primary-text transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          Hoje
        </button>
        {onClear && (
          <button
            type="button"
            disabled={!value}
            onClick={onClear}
            className="rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  )
}
