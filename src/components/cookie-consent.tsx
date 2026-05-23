'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'kpi-cookie-consent'
const CONSENT_VERSION = '1'

/**
 * Banner de consentimento de cookies (LGPD). O sistema usa apenas cookies
 * essenciais (sessão NextAuth); o banner informa e registra o aceite localmente
 * — sem cookie de tracking, o próprio aceite vive em localStorage para não
 * exigir consentimento para registrar o consentimento.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== CONSENT_VERSION) setVisible(true)
    } catch {
      // localStorage indisponível (modo restrito) — não mostra banner.
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, CONSENT_VERSION)
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Usamos apenas cookies essenciais para autenticação e funcionamento do sistema. Ao
          continuar, você concorda com nossa{' '}
          <Link
            href="/privacidade"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Política de Privacidade
          </Link>
          .
        </p>
        <Button onClick={accept} size="sm" className="shrink-0">
          Entendi
        </Button>
      </div>
    </div>
  )
}
