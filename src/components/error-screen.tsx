'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
  /**
   * Variantes de layout:
   * - `panel`: usado em layouts internos com sidebar (admin/client).
   * - `fullscreen`: usado em error.tsx do root (sem layout).
   */
  variant?: 'panel' | 'fullscreen'
  title?: string
  message?: string
}

export function ErrorScreen({
  error,
  reset,
  variant = 'panel',
  title = 'Algo deu errado',
  message = 'Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.',
}: Props) {
  useEffect(() => {
    logger.error('UI error boundary', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  const containerCls =
    variant === 'fullscreen'
      ? 'flex min-h-screen flex-col items-center justify-center gap-4 text-center'
      : 'flex flex-col items-center justify-center gap-4 py-24 text-center'

  return (
    <div className={containerCls}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground/70">ref: {error.digest}</p>
      )}
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
