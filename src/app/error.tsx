'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-xl font-semibold">Algo deu errado</h2>
      <p className="text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.
      </p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
