'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Caixa de erro inline dos error boundaries de rota — nunca `alert()`:
 * destructive com "Recarregar" (reset do boundary). Display puro; cada
 * `error.tsx` só passa os títulos.
 *
 * Detecta o 413 do `serverActions.bodySizeLimit` ("Body exceeded") e troca o
 * título. ATENÇÃO: a mensagem original só chega ao cliente em DEV — em prod o
 * React redige erros de servidor (mensagem genérica + digest), então lá cai
 * sempre no `loadTitle`. A mensagem amigável de tamanho em prod vem do zod
 * (`.max()` nos schemas) via `Result`/toast, não deste boundary.
 */
export function RouteErrorCard({
  error,
  reset,
  loadTitle,
  bodyTooLargeTitle = 'Texto muito grande',
}: {
  error: Error & { digest?: string }
  reset: () => void
  /** Título do caso genérico, ex.: "Erro ao carregar as atividades". */
  loadTitle: string
  /** Título quando o body estourou o limite (detectável só em dev). */
  bodyTooLargeTitle?: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const isBodyTooLarge = error.message?.includes('Body exceeded')

  const title = isBodyTooLarge ? bodyTooLargeTitle : loadTitle

  const description = isBodyTooLarge
    ? 'O texto enviado excede o limite permitido. Reduza o conteúdo e tente novamente.'
    : 'Verifique a conexão e tente novamente.'

  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-destructive/30 bg-destructive/10 px-[18px] py-4">
      <AlertTriangle className="h-[18px] w-[18px] flex-none text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-destructive">{title}</div>
        <div className="text-[12.5px] text-muted-foreground">{description}</div>
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
