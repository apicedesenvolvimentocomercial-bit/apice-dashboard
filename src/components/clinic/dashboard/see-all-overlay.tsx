'use client'

import { ChevronUp } from 'lucide-react'

/** Pill de contagem ao lado do título ("6 metas", "8 procedimentos"). */
export function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-accent px-[9px] py-0.5 text-[11.5px] font-semibold tabular-nums text-primary-text">
      {children}
    </span>
  )
}

/** Botão "Ver todas/todos" com badge dourado "+N" (handoff §7.1). */
export function SeeAllButton({
  label,
  more,
  onClick,
}: {
  label: string
  more: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-transparent py-0 pl-[11px] pr-2 text-xs font-semibold text-primary-text transition-colors hover:bg-accent"
    >
      {label}
      <span className="inline-flex h-[18px] items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
        +{more}
      </span>
    </button>
  )
}

/**
 * Painel "Ver todas/todos" SOBREPOSTO ao próprio card (handoff §7.3): overlay
 * fixo fecha ao clicar fora; painel absoluto cobre o card com borda dourada,
 * cabeçalho + "Ver menos" e corpo rolável (max 62vh/620px). Exclusividade
 * entre cards vem de graça: o overlay bloqueia o resto da tela.
 */
export function SeeAllOverlay({
  title,
  countPill,
  onClose,
  padding = 'p-5',
  children,
}: {
  title: string
  countPill: string
  onClose: () => void
  /** Padding do painel — casa com o do card coberto. */
  padding?: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className={`absolute inset-x-0 top-0 z-50 flex flex-col rounded-[13px] border border-primary/35 bg-card shadow-overlay ${padding}`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-[9px]">
            <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
              {title}
            </h2>
            <CountPill>{countPill}</CountPill>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-lg border border-border bg-transparent px-2.5 text-xs font-semibold text-primary-text transition-colors hover:bg-accent"
          >
            <ChevronUp className="h-[13px] w-[13px]" aria-hidden="true" />
            Ver menos
          </button>
        </div>
        <div className="mt-[18px] flex max-h-[min(62vh,620px)] flex-col gap-[13px] overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}
