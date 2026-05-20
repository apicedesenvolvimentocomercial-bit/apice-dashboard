'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Info, MoreVertical, Play, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import {
  acknowledgeInsightAction,
  dismissInsightAction,
  resolveInsightAction,
  startInsightAction,
} from '@/server/actions/insight-actions'

import { categoryLabel, severityLabel, statusLabel } from './labels'

type Props = {
  insight: {
    id: string
    ruleKey: string
    category: string
    severity: 'INFO' | 'WARNING' | 'CRITICAL'
    status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED'
    title: string
    diagnosis: string
    suggestion: string
    estimatedImpact: number | null
    createdAt: Date
  }
}

const TONE: Record<
  Props['insight']['severity'],
  { card: string; badge: 'critical' | 'warning' | 'info' }
> = {
  CRITICAL: { card: 'border-l-4 border-l-rose-500', badge: 'critical' },
  WARNING: { card: 'border-l-4 border-l-amber-500', badge: 'warning' },
  INFO: { card: 'border-l-4 border-l-sky-500', badge: 'info' },
}

const SEVERITY_ICON = { CRITICAL: AlertTriangle, WARNING: AlertTriangle, INFO: Info }

export function InsightCard({ insight }: Props) {
  const [isPending, startTransition] = useTransition()
  const [dismissOpen, setDismissOpen] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const Icon = SEVERITY_ICON[insight.severity]
  const tone = TONE[insight.severity]

  const run = (
    label: string,
    action: () => Promise<{ success: boolean; error?: { message: string } }>
  ) => {
    startTransition(async () => {
      const r = await action()
      if (r.success) toast.success(label)
      else toast.error(r.error?.message ?? 'Falha ao executar ação')
    })
  }

  const confirmDismiss = () => {
    if (dismissReason.trim().length < 3) {
      toast.error('Informe um motivo com pelo menos 3 caracteres')
      return
    }
    startTransition(async () => {
      const r = await dismissInsightAction(insight.id, { reason: dismissReason.trim() })
      if (r.success) {
        toast.success('Insight dispensado')
        setDismissOpen(false)
        setDismissReason('')
      } else {
        toast.error(r.error?.message ?? 'Falha ao dispensar')
      }
    })
  }

  return (
    <Card className={tone.card}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold leading-tight">{insight.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant={tone.badge}>{severityLabel(insight.severity)}</Badge>
                <Badge variant="outline">{categoryLabel(insight.category)}</Badge>
                <Badge variant="secondary">{statusLabel(insight.status)}</Badge>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isPending}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {insight.status === 'OPEN' && (
                <DropdownMenuItem
                  onClick={() =>
                    run('Insight reconhecido', () => acknowledgeInsightAction(insight.id))
                  }
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Reconhecer
                </DropdownMenuItem>
              )}
              {insight.status !== 'IN_PROGRESS' && insight.status !== 'RESOLVED' && (
                <DropdownMenuItem
                  onClick={() =>
                    run('Marcado como em progresso', () => startInsightAction(insight.id))
                  }
                >
                  <Play className="mr-2 h-4 w-4" />
                  Em progresso
                </DropdownMenuItem>
              )}
              {insight.status !== 'RESOLVED' && (
                <DropdownMenuItem
                  onClick={() => run('Insight resolvido', () => resolveInsightAction(insight.id))}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Resolver
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setDismissOpen(true)} className="text-destructive">
                <X className="mr-2 h-4 w-4" />
                Dispensar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-sm text-muted-foreground">{insight.diagnosis}</p>
        <p className="text-sm">
          <span className="font-medium">Sugestão:</span> {insight.suggestion}
        </p>
        {insight.estimatedImpact != null && insight.estimatedImpact > 0 && (
          <p className="text-xs text-muted-foreground">
            Impacto estimado: {formatCurrency(insight.estimatedImpact)}
          </p>
        )}

        <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dispensar insight</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`dismiss-reason-${insight.id}`}>Motivo</Label>
              <Input
                id={`dismiss-reason-${insight.id}`}
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Ex.: já resolvido fora do sistema"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDismissOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={confirmDismiss} disabled={isPending}>
                {isPending ? 'Dispensando...' : 'Dispensar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
