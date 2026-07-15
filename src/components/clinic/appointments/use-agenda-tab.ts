'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Aba de nível superior da Agenda (agenda-handoff §3.1): "Agendamentos" ×
 * "Calendário". O estado vive na URL (`?tab=calendario`) porque topbar
 * (chrome do layout) e conteúdo da página precisam do mesmo valor — e a troca
 * usa shallow history (sem round-trip ao servidor; `useSearchParams` reflete
 * `history.replaceState` no App Router).
 */
export type AgendaTab = 'agendamentos' | 'calendario'

export function useAgendaTab(): { tab: AgendaTab; setTab: (t: AgendaTab) => void } {
  const params = useSearchParams()
  const tab: AgendaTab = params.get('tab') === 'calendario' ? 'calendario' : 'agendamentos'

  const setTab = useCallback((next: AgendaTab) => {
    const sp = new URLSearchParams(window.location.search)
    if (next === 'agendamentos') sp.delete('tab')
    else sp.set('tab', next)
    const qs = sp.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [])

  return { tab, setTab }
}
