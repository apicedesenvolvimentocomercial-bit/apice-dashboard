'use client'

import { RouteErrorCard } from '@/components/shared/route-error-card'

/** Erro inline das Configurações. */
export default function ConfiguracoesError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorCard {...props} loadTitle="Erro ao carregar as configurações" />
}
