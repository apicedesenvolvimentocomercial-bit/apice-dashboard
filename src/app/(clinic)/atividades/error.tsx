'use client'

import { RouteErrorCard } from '@/components/shared/route-error-card'

/** Erro inline da tela de Atividades (atividades-handoff §9.4). */
export default function AtividadesError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteErrorCard
      {...props}
      loadTitle="Erro ao carregar as atividades"
      bodyTooLargeTitle="Descrição muito grande"
    />
  )
}
