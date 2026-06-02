'use client'

import { Check, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  regenerateWebhookTokenAction,
  revokeWebhookTokenAction,
} from '@/server/actions/webhook-actions'

const PROVIDERS = ['meta-ads', 'google-ads', 'whatsapp'] as const

/**
 * Card de Webhook de leads (/configuracoes, só titular). Mostra as URLs por provider
 * + gera/revoga o token por-clínica. O token cru só aparece UMA vez na geração.
 */
export function WebhookSettings({ hasToken }: { hasToken: boolean }) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const [token, setToken] = useState<string | null>(null)
  const [configured, setConfigured] = useState(hasToken)
  const [loading, setLoading] = useState<'gen' | 'revoke' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  async function regenerate() {
    setLoading('gen')
    const res = await regenerateWebhookTokenAction()
    setLoading(null)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setToken(res.data.token)
    setConfigured(true)
    toast.success('Token gerado. Copie agora — não será mostrado de novo.')
  }

  async function revoke() {
    setLoading('revoke')
    const res = await revokeWebhookTokenAction()
    setLoading(null)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setToken(null)
    setConfigured(false)
    toast.success('Token revogado. O webhook está desabilitado.')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Webhook de leads</CardTitle>
        <CardDescription>
          Receba leads de anúncios e WhatsApp direto no funil. No provider, configure a URL do canal
          + o header <code className="rounded bg-muted px-1 py-0.5 text-xs">x-webhook-token</code>{' '}
          com o token gerado aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const url = `${base}/api/webhooks/${p}`
            return (
              <div key={p} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{p}</span>
                <Input readOnly value={url} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Copiar URL ${p}`}
                  onClick={() => copy(url, p)}
                >
                  {copied === p ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )
          })}
        </div>

        {token && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">Token (copie agora — não será mostrado de novo)</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={token} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copiar token"
                onClick={() => copy(token, 'token')}
              >
                {copied === 'token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={regenerate} disabled={loading !== null}>
            {loading === 'gen' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {configured ? 'Regenerar token' : 'Gerar token'}
          </Button>
          {configured && (
            <Button type="button" variant="outline" onClick={revoke} disabled={loading !== null}>
              {loading === 'revoke' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Revogar
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {configured ? 'Webhook ativo.' : 'Webhook desabilitado.'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
