'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, Check, Info, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { recalculateInsightsAction } from '@/server/actions/insight-actions'

import { InsightCard, type InsightData } from './insight-card'
import { statusLabel } from './labels'
import { timeAgo } from './relative-time'

type Insight = InsightData & { updatedAt: Date }

type Props = {
  clientId: string
  insights: Insight[]
}

type StatusTab = Insight['status']

const STATUS_TABS: StatusTab[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']

// Resumo conta SÓ ativos — resolvidos/dispensados não entram (handoff §4.2).
const ACTIVE_STATUSES: StatusTab[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']

// Chave gravada pelo card "Insights ativos" do Dashboard (handoff §13) — o id
// do insight a focar; consumida (removida) ao montar. O anel de destaque NÃO
// expira sozinho (decisão de produto — o protótipo usava 2600ms): ele persiste
// até o usuário clicar no card destacado e recolhê-lo.
const FOCUS_KEY = 'senno-insight-focus'

const SUMMARY = [
  {
    key: 'CRITICAL' as const,
    label: 'Críticos abertos',
    icon: AlertTriangle,
    tile: 'bg-destructive/[0.12] text-destructive',
  },
  {
    key: 'WARNING' as const,
    label: 'Avisos abertos',
    icon: AlertTriangle,
    tile: 'bg-warn-bg text-warn',
  },
  { key: 'INFO' as const, label: 'Informativos abertos', icon: Info, tile: 'bg-ok-bg text-ok' },
]

/**
 * Tela Insights — redesign Senno (prompt/Senno Redesign/Insights): resumo por
 * severidade (3 cards), 5 abas de status em underline dourado MEDIDO com
 * contadores (§5), lista de cards expansíveis (§6–§11), estado vazio composto
 * por aba (§12) e deep-link com flash vindo do Dashboard (§13). O h1 "Insights"
 * vive no topbar (chrome do layout), não aqui.
 */
export function InsightsPage({ clientId, insights }: Props) {
  const [tab, setTab] = useState<StatusTab>('OPEN')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => insights.filter((i) => i.status === tab), [insights, tab])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of insights) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [insights])

  const active = insights.filter((i) => ACTIVE_STATUSES.includes(i.status))
  const sevCount = (sev: Insight['severity']) => active.filter((i) => i.severity === sev).length

  // Selo "Última análise" — derivado do updatedAt mais recente (o engine
  // reroda ao carregar a página e a cada Recalcular).
  const lastRun = useMemo(() => {
    let max: Date | null = null
    for (const i of insights) {
      const d = new Date(i.updatedAt)
      if (!max || d > max) max = d
    }
    return max
  }, [insights])

  // ---- Indicador da aba ativa (underline 2px MEDIDO — handoff §5.1) ----
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false })
  const measure = useCallback(() => {
    const activeEl = tabBarRef.current?.querySelector<HTMLElement>('[data-tab-active="1"]')
    if (!activeEl) return
    setInd({ left: activeEl.offsetLeft, width: activeEl.offsetWidth, ready: true })
  }, [])
  useEffect(() => {
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // `insights` porque os contadores mudam a largura das abas.
  }, [measure, tab, insights])

  // ---- Deep-link vindo do Dashboard (handoff §13): foco + flash ----
  useEffect(() => {
    let focus: string | null = null
    try {
      focus = localStorage.getItem(FOCUS_KEY)
      if (focus) localStorage.removeItem(FOCUS_KEY) // consumo único
    } catch {
      return
    }
    if (!focus) return
    // Casa por id (preferido) com fallback por título (links antigos).
    const target = insights.find((i) => i.id === focus) ?? insights.find((i) => i.title === focus)
    if (!target) return
    setTab(target.status)
    setExpanded((prev) => ({ ...prev, [target.id]: true }))
    setFlash(target.id)
    // Só no mount — a chave já foi consumida. O anel é apagado no onToggle do
    // card destacado (não por timer: com o Strict Mode o efeito roda 2×, a 2ª
    // passada não acha mais a chave e um timer agendado aqui era cancelado no
    // cleanup — o anel ficava aceso para sempre).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recalc = () => {
    startTransition(async () => {
      const r = await recalculateInsightsAction(clientId)
      if (r.success) {
        toast.success(
          `Insights recalculados (${r.data.created} novos, ${r.data.resolved} resolvidos)`
        )
      } else {
        toast.error('Falha ao recalcular')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo por severidade — 3 cards (handoff §4). */}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {SUMMARY.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-3.5 rounded-[13px] border border-border bg-card px-[18px] py-4 shadow-card transition-colors hover:border-primary/50"
          >
            <span
              className={cn(
                'flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px]',
                s.tile
              )}
            >
              <s.icon className="h-[21px] w-[21px]" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-muted-foreground">{s.label}</div>
              <div className="text-[26px] font-bold tabular-nums leading-[1.1] tracking-[-0.02em]">
                {sevCount(s.key)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Barra de abas de status + Recalcular (handoff §5). */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 overflow-x-auto">
          <div
            ref={tabBarRef}
            className="relative flex w-max items-center gap-1 border-b border-border"
            role="tablist"
            aria-label="Status dos insights"
          >
            <span
              className="pointer-events-none absolute bottom-[-1px] left-0 h-0.5 rounded-[2px] bg-primary transition-[transform,width,opacity] duration-320 ease-senno"
              style={{
                width: ind.width,
                transform: `translateX(${ind.left}px)`,
                opacity: ind.ready ? 1 : 0,
              }}
              aria-hidden="true"
            />
            {STATUS_TABS.map((s) => {
              const isActive = tab === s
              const count = counts[s] ?? 0
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-tab-active={isActive ? '1' : undefined}
                  onClick={() => setTab(s)}
                  className={cn(
                    '-mb-px inline-flex items-center gap-[7px] whitespace-nowrap border-b-2 border-transparent px-3 py-[9px] text-[13.5px] font-semibold transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {statusLabel(s)}
                  {count > 0 && (
                    <span
                      className={cn(
                        'min-w-[18px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums',
                        isActive
                          ? 'bg-primary/[0.16] text-primary-text'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-none items-center gap-3 pb-1.5">
          {lastRun && (
            <span
              className="whitespace-nowrap text-[11.5px] text-muted-foreground"
              suppressHydrationWarning
            >
              Última análise {timeAgo(lastRun)}
            </span>
          )}
          <button
            type="button"
            onClick={recalc}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-input bg-card px-3.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
          >
            <RefreshCw
              className={cn('h-[15px] w-[15px]', isPending && 'animate-spin')}
              aria-hidden="true"
            />
            Recalcular
          </button>
        </div>
      </div>

      {/* Lista OU estado vazio — mutuamente exclusivos (handoff §6/§12). */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-ok-bg text-ok">
            <Check className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="text-sm font-semibold">Nenhum insight em "{statusLabel(tab)}"</div>
          <p className="-mt-1 max-w-[360px] text-[12.5px] text-muted-foreground">
            Quando a Senno identificar algo que merece sua atenção neste status, ele aparece aqui
            com a recomendação sugerida.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-3 transition-opacity',
            isPending && 'pointer-events-none opacity-60'
          )}
        >
          {filtered.map((i) => (
            <InsightCard
              key={i.id}
              insight={i}
              expanded={!!expanded[i.id]}
              onToggle={() => {
                // Clicar no card destacado (recolhendo-o) apaga o anel do deep-link.
                if (flash === i.id) setFlash(null)
                setExpanded((prev) => ({ ...prev, [i.id]: !prev[i.id] }))
              }}
              flash={flash === i.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
