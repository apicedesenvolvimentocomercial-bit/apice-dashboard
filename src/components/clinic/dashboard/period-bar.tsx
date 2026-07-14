'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'day', label: 'Hoje' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
] as const

type Option = (typeof OPTIONS)[number]['value']

/**
 * Barra de período do dashboard (handoff §4): segmented dourado com PÍLULA
 * DESLIZANTE (translateX animado, overshoot leve), centralizado no corpo.
 * Mantém a semântica do PeriodFilter antigo (query param `period`).
 */
export function PeriodBar() {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const current = (params.get('period') ?? 'month') as Option
  const idx = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === current)
  )

  const setPeriod = useCallback(
    (next: Option) => {
      const sp = new URLSearchParams(params)
      sp.set('period', next)
      sp.delete('from')
      sp.delete('to')
      startTransition(() => router.replace(`?${sp.toString()}`, { scroll: false }))
    },
    [params, router]
  )

  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className={cn(
          'relative grid auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]',
          isPending && 'opacity-70'
        )}
        role="tablist"
        aria-label="Selecionar período"
      >
        <div
          className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-primary shadow-card transition-transform duration-340 ease-senno"
          style={{
            width: `calc((100% - 6px) / ${OPTIONS.length})`,
            transform: `translateX(${idx * 100}%)`,
          }}
          aria-hidden="true"
        />
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={current === opt.value}
            onClick={() => setPeriod(opt.value)}
            className={cn(
              'relative z-[1] whitespace-nowrap rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-250',
              current === opt.value ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
