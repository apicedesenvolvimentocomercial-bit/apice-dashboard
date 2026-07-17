'use client'

import { RouteErrorCard } from '@/components/shared/route-error-card'

/** Erro inline da tela Financeiro (Financeiro-handoff §16). */
export default function FinancialError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorCard {...props} loadTitle="Erro ao carregar o financeiro" />
}
