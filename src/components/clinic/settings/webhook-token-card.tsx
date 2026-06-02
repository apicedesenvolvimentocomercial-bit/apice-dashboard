'use client'

import { Check, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  revokeWebhookTokenAction,
  rotateWebhookTokenAction,
} from '@/server/actions/settings-actions'

const PROVIDERS = ['whatsapp', 'meta-ads', 'google-ads'] as const

type Props = {
  hasToken: boolean
  appUrl: string
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          toast.success(`${label} copiado`)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error('Não foi possível copiar')
        }
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

/**
 * Card de configuração do webhook de ingestão de leads (seguranca-pendencias #2).
 * Só o titular vê (gate na página). O token CRU aparece UMA vez ao gerar/rotacionar
 * — depois só o hash fica no banco. O provider deve enviá-lo no header
 * `x-webhook-secret`; é ele que amarra a requisição a ESTA clínica.
 */
export function WebhookTokenCard({ hasToken, appUrl }: Props) {
  const [configured, setConfigured] = useState(hasToken)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const base = appUrl.replace(/\/$/, '')

  async function rotate() {
    setLoading(true)
    const res = await rotateWebhookTokenAction()
    setLoading(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setToken(res.data.token)
    setConfigured(true)
    toast.success('Token gerado. Copie agora — não será exibido novamente.')
  }

  async function revoke() {
    setLoading(true)
    const res = await revokeWebhookTokenAction()
    setLoading(false)
    if (!res.success) {
      toast.error(res.error.message)
      return
    }
    setToken(null)
    setConfigured(false)
    toast.success('Token revogado.')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Webhook de leads</CardTitle>
          <Badge variant={configured ? 'success' : 'secondary'}>
            {configured ? 'Configurado' : 'Não configurado'}
          </Badge>
        </div>
        <CardDescription>
          Recebe leads das integrações (WhatsApp, Meta Ads, Google Ads). O token autentica a
          requisição e vincula o lead a esta clínica — envie-o no header{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">x-webhook-secret</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {token && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">Seu novo token (copie agora):</p>
            <div className="flex gap-2">
              <Input readOnly value={token} className="font-mono text-xs" />
              <CopyButton value={token} label="Token" />
            </div>
            <p className="text-xs text-muted-foreground">
              Por segurança, guardamos apenas o hash. Este valor não será exibido novamente — se
              perdê-lo, gere um novo.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Endpoints</p>
          {PROVIDERS.map((p) => {
            const url = `${base}/api/webhooks/${p}`
            return (
              <div key={p} className="flex items-center gap-2">
                <Input readOnly value={url} className="font-mono text-xs" />
                <CopyButton value={url} label="URL" />
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={rotate} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {configured ? 'Rotacionar token' : 'Gerar token'}
          </Button>
          {configured && (
            <Button type="button" variant="outline" onClick={revoke} disabled={loading}>
              <Trash2 className="mr-2 h-4 w-4" />
              Revogar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
