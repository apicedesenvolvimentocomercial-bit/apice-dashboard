import { CalendarDays, Plus } from 'lucide-react'

/**
 * Estados da Agenda (agenda-handoff §10 + design.md §5): skeleton com
 * shimmer (nunca spinner), vazio composto (com ação) e erro inline. O
 * skeleton mantém a "estrutura" da grade (cabeçalho + linhas) e shimmeriza
 * só onde haveria dado.
 */
export function AgendaGridSkeleton() {
  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
      <div className="grid grid-cols-[58px_repeat(7,1fr)] items-center gap-2 border-b border-border px-2 py-[9px]">
        <div />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="senno-shimmer mx-auto h-[15px] w-14 rounded-md" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, row) => (
        <div
          key={row}
          className="grid h-[66px] grid-cols-[58px_repeat(7,1fr)] gap-2 border-t border-grid px-2 py-2"
        >
          <div className="senno-shimmer ml-auto h-[11px] w-9 self-start rounded" />
          {Array.from({ length: 7 }).map((_, col) => (
            <div key={col}>
              {(row + col) % 3 === 0 && <div className="senno-shimmer h-full rounded-[7px]" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

type EmptyProps = {
  title: string
  hint: string
  actionLabel: string
  onAction: () => void
}

function EmptyBox({ title, hint, actionLabel, onAction }: EmptyProps) {
  return (
    <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-8 py-7 text-center shadow-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="text-sm font-semibold">{title}</div>
      <p className="-mt-1 max-w-[300px] text-[12.5px] text-muted-foreground">{hint}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-1.5 inline-flex h-9 items-center gap-[7px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
        {actionLabel}
      </button>
    </div>
  )
}

/** Vazio sobre a grade (Dia/Semana/Mês): a grade continua visível e clicável
 * por baixo — só a caixa central captura o mouse. */
export function AgendaEmptyOverlay(props: EmptyProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto">
        <EmptyBox {...props} />
      </div>
    </div>
  )
}

/** Vazio da visão Lista (sem grade por trás). */
export function AgendaEmptyCard(props: EmptyProps) {
  return <EmptyBox {...props} />
}
