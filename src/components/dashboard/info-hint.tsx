'use client'

import { HelpCircle } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Props = {
  label: string
  children: React.ReactNode
}

/**
 * Ícone de interrogação clicável que abre um popover com explicação curta.
 * Pensado para títulos de cards/gráficos no dashboard. Quando o conteúdo
 * é simples (string) ou rico (JSX), basta passar via children.
 */
export function InfoHint({ label, children }: Props) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Sobre ${label}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-xs text-xs leading-relaxed text-foreground">
        {children}
      </PopoverContent>
    </Popover>
  )
}
