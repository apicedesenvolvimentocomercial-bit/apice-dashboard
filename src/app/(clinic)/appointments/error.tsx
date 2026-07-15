'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Erro inline da Agenda (agenda-handoff §10) — nunca `alert()`: caixa
 * destructive com "Recarregar" (reset do boundary).
 */
export default function AgendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-destructive/30 bg-destructive/10 px-[18px] py-4">
      <AlertTriangle className="h-[18px] w-[18px] flex-none text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-destructive">
          Erro ao carregar a agenda
        </div>
        <div className="text-[12.5px] text-muted-foreground">
          Verifique a conexão e tente novamente.
        </div>
      </div>
      <button
        type="button"
        onClick={reset}
        className="h-[30px] flex-none rounded-[7px] border border-destructive/40 bg-transparent px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
      >
        Recarregar
      </button>
    </div>
  )
}
