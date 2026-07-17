'use client'

import { RouteErrorCard } from '@/components/shared/route-error-card'

/** Erro inline da Agenda (agenda-handoff §10). */
export default function AgendaError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorCard
      {...props}
      loadTitle="Erro ao carregar a agenda"
      bodyTooLargeTitle="Descrição muito grande"
    />
  )
}
