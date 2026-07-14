'use client'

import { cn } from '@/lib/utils'

/**
 * Visão Lista da Agenda (agenda-handoff §8): pilha de grupos por dia, cada
 * grupo é seu próprio card. Diferente do protótipo (que omite domingo por ser
 * fechado), aqui um dia só entra se TEM itens — se existir agendamento real
 * num domingo, ele aparece (dado vence o protótipo).
 */
export type AgendaListItem = {
  id: string
  /** "08:30 – 09:10" ou "Dia inteiro". */
  timeLabel: string
  title: string
  subtitle?: string | null
  durLabel?: string | null
  /** Cancelado/faltou: apagado + título riscado. */
  muted?: boolean
  /** Etiqueta de cor do evento pessoal (Calendário). */
  dotColor?: string | null
  onClick?: () => void
}

export type AgendaListGroup = {
  key: string
  dateLabel: string
  isToday: boolean
  countLabel: string
  items: AgendaListItem[]
}

export function AgendaListView({ groups }: { groups: AgendaListGroup[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((g) => (
        <div
          key={g.key}
          className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 border-b border-border px-4 py-[11px]',
              g.isToday && 'bg-primary/[0.06]'
            )}
          >
            <span
              className={cn(
                'text-[13.5px] font-semibold',
                g.isToday ? 'text-primary-text' : 'text-foreground'
              )}
            >
              {g.dateLabel}
            </span>
            {g.isToday && (
              <span className="rounded-full bg-primary px-2 py-px text-[10.5px] font-semibold text-primary-foreground">
                Hoje
              </span>
            )}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {g.countLabel}
            </span>
          </div>
          {g.items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={it.onClick}
              className={cn(
                'flex w-full items-center gap-4 border-t border-grid px-4 py-3 text-left transition-colors first-of-type:border-t-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
                it.muted && 'opacity-55'
              )}
            >
              <span className="w-[104px] flex-none text-[12.5px] font-semibold tabular-nums text-primary-text">
                {it.timeLabel}
              </span>
              <span
                className="w-[3px] flex-none self-stretch rounded-full bg-primary/40"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'flex items-center gap-2 text-[length:clamp(13px,0.14vw+11.2px,14.3px)] font-semibold leading-[1.25]',
                    it.muted && 'line-through'
                  )}
                >
                  {it.dotColor && (
                    <span
                      className="h-[7px] w-[7px] flex-none rounded-full"
                      style={{ background: it.dotColor }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{it.title}</span>
                </span>
                {it.subtitle && (
                  <span className="block truncate text-[11.5px] leading-[1.25] text-muted-foreground">
                    {it.subtitle}
                  </span>
                )}
              </span>
              {it.durLabel && (
                <span className="flex-none text-[11.5px] tabular-nums text-muted-foreground">
                  {it.durLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
