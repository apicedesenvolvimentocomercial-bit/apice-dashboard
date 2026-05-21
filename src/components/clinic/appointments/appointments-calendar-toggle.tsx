'use client'

import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Toggle "Agendamentos / Calendário" da aba de appointments da clínica (Fase 4).
 * Agendamentos é o default (ativo em preto); Calendário fica cinza até clicar.
 * Troca com slide suave: Agendamentos entra da esquerda, Calendário da direita.
 *
 * Recebe os dois painéis já montados (slots) da page server — o de
 * agendamentos (pacientes) e o calendário pessoal da clínica. São mundos
 * separados; este componente só alterna a visualização.
 */
type Tab = 'appointments' | 'calendar'

type Props = {
  appointmentsSlot: React.ReactNode
  calendarSlot: React.ReactNode
}

export function AppointmentsCalendarToggle({ appointmentsSlot, calendarSlot }: Props) {
  const [tab, setTab] = useState<Tab>('appointments')

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        <button
          type="button"
          onClick={() => setTab('appointments')}
          className={cn(
            'transition-colors',
            tab === 'appointments'
              ? 'text-foreground'
              : 'text-muted-foreground/40 hover:text-muted-foreground'
          )}
        >
          Agendamentos
        </button>
        <span className="mx-2 text-muted-foreground/30">/</span>
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={cn(
            'transition-colors',
            tab === 'calendar'
              ? 'text-foreground'
              : 'text-muted-foreground/40 hover:text-muted-foreground'
          )}
        >
          Calendário
        </button>
      </h1>

      <div className="overflow-hidden">
        {tab === 'appointments' ? (
          <div key="appts" className="duration-300 animate-in fade-in slide-in-from-left-8">
            {appointmentsSlot}
          </div>
        ) : (
          <div key="cal" className="duration-300 animate-in fade-in slide-in-from-right-8">
            {calendarSlot}
          </div>
        )}
      </div>
    </div>
  )
}
