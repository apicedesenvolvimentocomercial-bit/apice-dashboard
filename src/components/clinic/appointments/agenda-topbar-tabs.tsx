'use client'

import { cn } from '@/lib/utils'

import { useAgendaTab, type AgendaTab } from './use-agenda-tab'

const TABS: { key: AgendaTab; label: string }[] = [
  { key: 'agendamentos', label: 'Agendamentos' },
  { key: 'calendario', label: 'Calendário' },
]

/**
 * Abas Agendamentos/Calendário no LUGAR do `<h1>` do topbar (agenda-handoff
 * §3.1) — no tamanho do h1. A margem negativa (-14px = padding vertical do
 * header) estica o wrapper até as bordas do header; o border-bottom do
 * wrapper cai sobre o do próprio header, virando uma única linha contínua.
 * O sublinhado de 2px da aba ativa sobrepõe essa linha (`-mb-px`).
 */
export function AgendaTopbarTabs() {
  const { tab, setTab } = useAgendaTab()

  return (
    <div className="-my-3.5 flex min-w-0 flex-1 items-stretch gap-0.5 self-stretch border-b border-border">
      {TABS.map((t) => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex items-center justify-center border-b-2 px-3.5 text-[length:clamp(22px,0.5vw+18px,27px)] font-semibold tracking-[-0.01em] transition-[color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
