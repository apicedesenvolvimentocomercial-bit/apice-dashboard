'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  Ban,
  CheckCircle2,
  ChevronDown,
  Filter,
  Heart,
  Lightbulb,
  Receipt,
  Tag,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatCurrency } from '@/lib/utils'
import {
  acknowledgeInsightAction,
  dismissInsightAction,
  reopenInsightAction,
  resolveInsightAction,
  startInsightAction,
} from '@/server/actions/insight-actions'

import { categoryLabel, severityLabel } from './labels'
import { shortDate, timeAgo } from './relative-time'

export type InsightData = {
  id: string
  ruleKey: string
  category: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED'
  title: string
  diagnosis: string
  suggestion: string
  estimatedImpact: number | null
  metadata: unknown
  createdAt: Date
  resolvedAt: Date | null
  dismissedAt: Date | null
  dismissReason: string | null
}

type Props = {
  insight: InsightData
  expanded: boolean
  onToggle: () => void
  /** Anel dourado do deep-link vindo do Dashboard (handoff §13). */
  flash: boolean
}

// Severidade → tint da métrica/tile + pill (handoff §16, tabela SEV).
const SEV: Record<InsightData['severity'], { tint: string; tileBg: string; pill: string }> = {
  CRITICAL: {
    tint: 'text-destructive',
    tileBg: 'bg-destructive/[0.12]',
    pill: 'bg-destructive/[0.12] text-destructive',
  },
  WARNING: { tint: 'text-warn', tileBg: 'bg-warn-bg', pill: 'bg-warn-bg text-warn' },
  INFO: { tint: 'text-ok', tileBg: 'bg-ok-bg', pill: 'bg-ok-bg text-ok' },
}

// Tile do card usa o ícone da CATEGORIA, não o da severidade (handoff §6.2).
// Mesmo mapeamento do card "Insights ativos" do Dashboard.
const CATEGORY_ICON: Record<string, React.ElementType> = {
  COMMERCIAL: Filter,
  FINANCIAL: Receipt,
  OPERATIONAL: Activity,
  RETENTION: Heart,
  MARKETING: Tag,
}

/**
 * Métrica de destaque do cabeçalho: `metadata.metric` ({value,label}) emitido
 * pelas regras do engine; insights antigos sem a chave caem no impacto
 * estimado em R$. Sem nenhum dos dois, o cabeçalho fica só com o título.
 */
function metricOf(insight: InsightData): { value: string; label: string } | null {
  const meta = insight.metadata
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const metric = (meta as Record<string, unknown>).metric
    if (metric && typeof metric === 'object' && !Array.isArray(metric)) {
      const { value, label } = metric as Record<string, unknown>
      if (typeof value === 'string' && typeof label === 'string') return { value, label }
    }
  }
  if (insight.estimatedImpact != null && insight.estimatedImpact > 0) {
    return { value: formatCurrency(insight.estimatedImpact), label: 'impacto estimado' }
  }
  return null
}

const BTN_BASE =
  'h-[33px] rounded-lg text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
const BTN_GHOST = cn(BTN_BASE, 'px-3 text-muted-foreground hover:bg-accent')
const BTN_OUTLINE = cn(
  BTN_BASE,
  'border border-input bg-card px-[13px] text-foreground hover:bg-accent'
)
const BTN_SOLID = cn(BTN_BASE, 'bg-primary px-3.5 text-primary-foreground hover:brightness-105')

/**
 * Card de insight do redesign (Insights-handoff §6): colapsado mostra tile da
 * categoria + título + métrica + pill de severidade; clicar expande (grid-rows
 * 0fr↔1fr) para diagnóstico, recomendação e as ações do status. Resolvidos/
 * dispensados esmaecem (opacity .72) e ganham nota de estado.
 *
 * Desvio documentado do protótipo: o diagnóstico (`desc`) É renderizado no
 * corpo expandido — os títulos reais do engine são genéricos ("Taxa de no-show
 * acima do crítico") e o diagnóstico carrega o contexto comparativo que no
 * protótipo estava embutido no título.
 */
export function InsightCard({ insight, expanded, onToggle, flash }: Props) {
  const [isPending, startTransition] = useTransition()
  const [dismissOpen, setDismissOpen] = useState(false)
  const [dismissReason, setDismissReason] = useState('')

  const sev = SEV[insight.severity]
  const CategoryIcon = CATEGORY_ICON[insight.category] ?? Activity
  const metric = metricOf(insight)
  const isDimmed = insight.status === 'RESOLVED' || insight.status === 'DISMISSED'

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

  // Nota de estado (só resolvido/dispensado — handoff §10/§11).
  const note =
    insight.status === 'RESOLVED' ? (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ok">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {insight.resolvedAt ? `Resolvido em ${shortDate(insight.resolvedAt)}` : 'Resolvido'}
      </span>
    ) : insight.status === 'DISMISSED' ? (
      <span
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground"
        title={insight.dismissReason ?? undefined}
      >
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        Dispensado
      </span>
    ) : null

  // Ações por status (handoff §6.5) — sem "Criar tarefa": atividade de clínica
  // exige alvo lead/paciente (invariante do produto), então o fluxo é
  // Reconhecer/Iniciar ação → Marcar resolvido.
  const actions =
    insight.status === 'OPEN' ? (
      <>
        <button
          type="button"
          className={BTN_GHOST}
          disabled={isPending}
          onClick={() => setDismissOpen(true)}
        >
          Dispensar
        </button>
        <button
          type="button"
          className={BTN_OUTLINE}
          disabled={isPending}
          onClick={() => run('Insight reconhecido', () => acknowledgeInsightAction(insight.id))}
        >
          Reconhecer
        </button>
        <button
          type="button"
          className={BTN_SOLID}
          disabled={isPending}
          onClick={() => run('Ação iniciada', () => startInsightAction(insight.id))}
        >
          Iniciar ação
        </button>
      </>
    ) : insight.status === 'ACKNOWLEDGED' ? (
      <>
        <button
          type="button"
          className={BTN_GHOST}
          disabled={isPending}
          onClick={() => setDismissOpen(true)}
        >
          Dispensar
        </button>
        <button
          type="button"
          className={BTN_SOLID}
          disabled={isPending}
          onClick={() => run('Ação iniciada', () => startInsightAction(insight.id))}
        >
          Iniciar ação
        </button>
      </>
    ) : insight.status === 'IN_PROGRESS' ? (
      <button
        type="button"
        className={BTN_SOLID}
        disabled={isPending}
        onClick={() => run('Insight resolvido', () => resolveInsightAction(insight.id))}
      >
        Marcar resolvido
      </button>
    ) : (
      <button
        type="button"
        className={BTN_GHOST}
        disabled={isPending}
        onClick={() => run('Insight reaberto', () => reopenInsightAction(insight.id))}
      >
        Reabrir
      </button>
    )

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        // Sem o label, o nome acessível do "botão" seria o texto do card
        // inteiro (título + métrica + recomendação + ações concatenados).
        aria-label={insight.title}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className={cn(
          'flex cursor-pointer gap-[15px] rounded-[13px] border border-border bg-card px-[18px] py-[15px] shadow-card outline outline-2 outline-offset-2',
          '[transition:border-color_.2s,box-shadow_.2s,transform_.2s,outline-color_.4s,opacity_.2s]',
          'hover:-translate-y-px hover:border-primary/50 hover:shadow-[0_5px_16px_hsl(var(--shadow)/calc(var(--shadow-a)*1.7))]',
          flash ? 'outline-primary' : 'outline-transparent',
          isDimmed && 'opacity-[0.72]'
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 flex-none items-center justify-center rounded-[11px]',
            sev.tileBg,
            sev.tint
          )}
        >
          <CategoryIcon className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[13px]">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[11px] gap-y-0.5">
              <span className="text-[14.5px] font-semibold leading-snug">{insight.title}</span>
              {metric && (
                <span className="whitespace-nowrap">
                  <span
                    className={cn('text-sm font-bold tabular-nums tracking-[-0.01em]', sev.tint)}
                  >
                    {metric.value}
                  </span>{' '}
                  <span className="text-[11.5px] text-muted-foreground">{metric.label}</span>
                </span>
              )}
            </div>
            <span
              className={cn(
                'flex-none whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold',
                sev.pill
              )}
            >
              {severityLabel(insight.severity)}
            </span>
            <ChevronDown
              className={cn(
                'h-[18px] w-[18px] flex-none text-muted-foreground transition-transform duration-340 ease-senno',
                expanded && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </div>

          {/* Região expansível — anima altura via grid-template-rows 0fr↔1fr (§6.4). */}
          <div
            className="grid transition-[grid-template-rows] duration-340 ease-senno-io"
            style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
          >
            <div className="min-h-0 overflow-hidden">
              {/* Interagir com o corpo não recolhe o card (§6.4). */}
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div className="flex flex-col gap-3 pt-[13px]" onClick={(e) => e.stopPropagation()}>
                <p className="m-0 text-[12.5px] leading-[1.4] text-muted-foreground">
                  {insight.diagnosis}
                </p>

                <div className="flex items-start gap-2 rounded-[10px] border border-border bg-muted/60 px-[13px] py-[11px]">
                  <Lightbulb
                    className="mt-px h-[15px] w-[15px] flex-none text-primary-text"
                    aria-hidden="true"
                  />
                  <p className="m-0 text-[12.5px] leading-[1.4]">
                    <strong className="font-semibold">Recomendação:</strong> {insight.suggestion}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-[7px] bg-accent px-[9px] py-[3px] text-[11px] font-semibold text-muted-foreground">
                    {categoryLabel(insight.category)}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground" suppressHydrationWarning>
                    {timeAgo(insight.createdAt)}
                  </span>
                  <span className="flex-1" />
                  {note}
                  {actions}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </>
  )
}
