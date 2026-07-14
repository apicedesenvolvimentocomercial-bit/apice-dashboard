'use client'

import {
  Check,
  Copy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Target,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  revokeWebhookTokenAction,
  rotateWebhookTokenAction,
} from '@/server/actions/settings-actions'

import { SettingsSectionCard } from './section-card'

/**
 * Seção Webhooks — redesign Senno (Configurações-handoff §11). Linha do token
 * (rótulo + valor mono à esquerda; Rotacionar/Revogar à direita) + lista de
 * endpoints com tile dourado e botão Copiar com estado "Copiado" (verde `ok`,
 * 1400ms, um por vez).
 *
 * Desvios documentados vs. protótipo:
 * - O token NÃO fica visível em repouso: só o hash é guardado (segurança —
 *   seguranca-pendencias #2). O valor cru aparece UMA vez após gerar/rotacionar
 *   (com botão de copiar + aviso); depois a linha mostra o estado mascarado
 *   "configurado" ou "— não configurado —" (equivale ao "— revogado —").
 */

const ENDPOINTS: { key: string; name: string; desc: string; icon: LucideIcon }[] = [
  { key: 'whatsapp', name: 'WhatsApp', desc: 'Cloud API', icon: MessageCircle },
  { key: 'meta-ads', name: 'Meta Ads', desc: 'Lead Ads', icon: Users },
  { key: 'google-ads', name: 'Google Ads', desc: 'Lead Form', icon: Target },
]

type Props = {
  hasToken: boolean
  appUrl: string
}

export function WebhookTokenCard({ hasToken, appUrl }: Props) {
  const [configured, setConfigured] = useState(hasToken)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Feedback "Copiado" por alvo (token ou endpoint) — um por vez (§11.2).
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const base = appUrl.replace(/\/$/, '')

  async function copyValue(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => {
        // Reseta só se ainda for este alvo (handoff §18).
        setCopiedId((curr) => (curr === id ? null : curr))
      }, 1400)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

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
    <SettingsSectionCard
      title="Webhooks"
      description={
        <>
          Recebe leads das integrações (WhatsApp, Meta Ads, Google Ads). O token autentica a
          requisição e vincula o lead a esta clínica — envie-o no header{' '}
          <code className="rounded-[5px] bg-muted px-1.5 py-px font-mono text-xs text-foreground">
            x-webhook-secret
          </code>
          .
        </>
      }
    >
      {/* Linha do token (§11.1) */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[11px] border border-border bg-background px-4 py-3.5">
        <div className="min-w-0">
          <div className="mb-[5px] text-[11.5px] font-semibold text-muted-foreground">
            Token de autenticação
          </div>
          {token ? (
            <div className="break-all font-mono text-[13.5px] tracking-[0.02em] text-foreground">
              {token}
            </div>
          ) : configured ? (
            <div className="font-mono text-[13.5px] tracking-[0.02em] text-foreground">
              whk_ ················{' '}
              <span className="font-sans text-xs text-muted-foreground">(configurado)</span>
            </div>
          ) : (
            <div className="text-[13.5px] text-muted-foreground">— não configurado —</div>
          )}
        </div>
        <div className="flex flex-none gap-2">
          {token && (
            <button
              type="button"
              onClick={() => copyValue('token', token)}
              className={cn(
                'inline-flex h-9 items-center gap-[7px] rounded-[9px] border px-[13px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                copiedId === 'token'
                  ? 'border-ok/40 bg-ok-bg text-ok'
                  : 'border-border bg-card text-foreground hover:bg-accent'
              )}
            >
              {copiedId === 'token' ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiedId === 'token' ? 'Copiado' : 'Copiar'}
            </button>
          )}
          <button
            type="button"
            onClick={rotate}
            disabled={loading}
            className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-card px-[13px] text-[12.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-text" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
            )}
            {configured ? 'Rotacionar' : 'Gerar token'}
          </button>
          {configured && (
            <button
              type="button"
              onClick={revoke}
              disabled={loading}
              className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-destructive/50 bg-transparent px-[13px] text-[12.5px] font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Revogar
            </button>
          )}
        </div>
      </div>

      {token && (
        <p className="m-0 mt-2.5 text-xs leading-[1.55] text-muted-foreground">
          Por segurança, guardamos apenas o hash. Este valor não será exibido novamente — se
          perdê-lo, gere um novo.
        </p>
      )}

      {/* Lista de endpoints (§11.2) */}
      <div className="mt-[22px]">
        <div className="mb-2.5 text-xs font-semibold text-muted-foreground">Endpoints</div>
        <div className="flex flex-col gap-[9px]">
          {ENDPOINTS.map((ep) => {
            const Icon = ep.icon
            const url = `${base}/api/webhooks/${ep.key}`
            const copied = copiedId === ep.key
            return (
              <div
                key={ep.key}
                className="flex items-center gap-3.5 rounded-[11px] border border-border bg-background px-3.5 py-3"
              >
                <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-primary/[0.14] text-primary-text">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold">{ep.name}</span>
                    <span className="text-[11.5px] text-muted-foreground">{ep.desc}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground">
                    {url}
                  </div>
                </div>
                <button
                  type="button"
                  title="Copiar link"
                  onClick={() => copyValue(ep.key, url)}
                  className={cn(
                    'inline-flex h-[34px] flex-none items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    copied
                      ? 'border-ok/40 bg-ok-bg text-ok'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  )}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </SettingsSectionCard>
  )
}
