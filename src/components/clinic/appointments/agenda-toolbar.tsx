'use client'

import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { cn } from '@/lib/utils'

import type { AgendaView } from './agenda-fc-shared'

const VIEW_OPTIONS: { value: AgendaView; label: string }[] = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'lista', label: 'Lista' },
]

type Props = {
  title: string
  view: AgendaView
  onViewChange: (v: AgendaView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  actionLabel: string
  actionIcon: LucideIcon
  onAction: () => void
  /** Botões extras entre o seletor de visão e o "Filtros" (ex.: engrenagem
   * do expediente na aba Agendamentos). */
  children?: React.ReactNode
}

/**
 * Toolbar da Agenda (agenda-handoff §4): setas de período + "Hoje" à
 * esquerda, título centrado, seletor de visão (segmented dourado com pílula
 * deslizante — mesmo primitivo do PeriodBar do dashboard) e o botão de ação
 * da página, dentro do conteúdo (design.md §4). O botão "Filtros" do
 * protótipo foi REMOVIDO por decisão do produto (2026-07-09) — era
 * decorativo e sem fluxo definido.
 */
export function AgendaToolbar({
  title,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  children,
}: Props) {
  const idx = Math.max(
    0,
    VIEW_OPTIONS.findIndex((o) => o.value === view)
  )

  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-[9px] border border-border">
          <button
            type="button"
            onClick={onPrev}
            title="Período anterior"
            aria-label="Período anterior"
            className="flex h-[34px] w-[34px] items-center justify-center border-r border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            title="Próximo período"
            aria-label="Próximo período"
            className="flex h-[34px] w-[34px] items-center justify-center bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="h-[34px] rounded-[9px] border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hoje
        </button>
      </div>

      <div className="min-w-0 flex-1 text-center text-[15.5px] font-semibold">{title || ' '}</div>

      <div className="flex items-center gap-[9px]">
        <div
          className="relative grid auto-cols-fr grid-flow-col rounded-[9px] border border-border bg-muted p-[3px]"
          role="tablist"
          aria-label="Selecionar visão"
        >
          <div
            className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] z-0 rounded-[7px] bg-primary shadow-card transition-transform duration-340 ease-senno"
            style={{
              width: `calc((100% - 6px) / ${VIEW_OPTIONS.length})`,
              transform: `translateX(${idx * 100}%)`,
            }}
            aria-hidden="true"
          />
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={view === opt.value}
              onClick={() => onViewChange(opt.value)}
              className={cn(
                'relative z-[1] whitespace-nowrap rounded-[7px] px-[13px] py-1.5 text-[12.5px] font-semibold transition-colors duration-250',
                view === opt.value ? 'text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {children}

        <ActionButton onClick={onAction}>
          <ActionIcon aria-hidden="true" />
          {actionLabel}
        </ActionButton>
      </div>
    </div>
  )
}
