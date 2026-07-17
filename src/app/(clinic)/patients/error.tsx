'use client'

import { RouteErrorCard } from '@/components/shared/route-error-card'

/** Erro inline da aba Pacientes (Pacientes-handoff §9). */
export default function PatientsError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorCard {...props} loadTitle="Erro ao carregar pacientes" />
}
