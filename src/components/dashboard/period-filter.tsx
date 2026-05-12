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

export function PeriodFilter() {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const current = (params.get('period') ?? 'month') as Option

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
    <div
      className={cn(
        'inline-flex rounded-md border bg-background p-0.5 text-sm shadow-sm',
        isPending && 'opacity-70'
      )}
      role="tablist"
      aria-label="Selecionar período"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={current === opt.value}
          onClick={() => setPeriod(opt.value)}
          className={cn(
            'rounded px-3 py-1.5 transition-colors',
            current === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
