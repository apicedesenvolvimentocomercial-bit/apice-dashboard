'use client'

import { Activity, AlertTriangle, Filter, Heart, Lightbulb, Receipt, Tag } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { CountPill, SeeAllButton, SeeAllOverlay } from './see-all-overlay'

export type InsightItem = {
  id: string
  title: string
  severity: string
  category: string
  status: string
}

const VISIBLE = 5

// Severidade → rótulo + par texto/fundo (handoff §12.2).
const SEVERITY: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: 'Crítico', tone: 'bg-destructive/[0.12] text-destructive' },
  WARNING: { label: 'Aviso', tone: 'bg-warn-bg text-warn' },
  INFO: { label: 'Info', tone: 'bg-ok-bg text-ok' },
}

const CATEGORY_LABEL: Record<string, string> = {
  COMMERCIAL: 'Comercial',
  FINANCIAL: 'Financeiro',
  OPERATIONAL: 'Operação',
  RETENTION: 'Retenção',
  MARKETING: 'Marketing',
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  COMMERCIAL: Filter,
  FINANCIAL: Receipt,
  OPERATIONAL: Activity,
  RETENTION: Heart,
  MARKETING: Tag,
}

// O card lista TODOS os ativos (aberto/reconhecido/em progresso) — iniciar
// ação não some com o insight daqui; a linha diz em que pé ele está.
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberto',
  ACKNOWLEDGED: 'Reconhecido',
  IN_PROGRESS: 'Em progresso',
}

function InsightLine({
  insight,
  truncate,
  onOpen,
}: {
  insight: InsightItem
  truncate: boolean
  onOpen: (id: string) => void
}) {
  const sev = SEVERITY[insight.severity] ?? SEVERITY.INFO
  const Icon =
    insight.severity === 'INFO' ? Activity : (CATEGORY_ICON[insight.category] ?? AlertTriangle)
  return (
    <button
      type="button"
      title="Ver insight"
      onClick={() => onOpen(insight.id)}
      className="flex w-full items-center gap-[11px] rounded-lg border-t border-border bg-transparent px-2.5 py-[11px] text-left transition-[transform,box-shadow,background-color] duration-160 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_9px_20px_-8px_hsl(var(--shadow)/calc(var(--shadow-a)*5))]"
    >
      <span
        className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg ${sev.tone}`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[12.5px] font-medium leading-[1.35] text-foreground ${
            truncate ? 'truncate' : ''
          }`}
        >
          {insight.title}
        </span>
        <span className="mt-px block text-[11px] text-muted-foreground">
          {CATEGORY_LABEL[insight.category] ?? insight.category}
          {' · '}
          {STATUS_LABEL[insight.status] ?? insight.status}
        </span>
      </span>
      <span
        className={`flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${sev.tone}`}
      >
        {sev.label}
      </span>
    </button>
  )
}

/**
 * Card "Insights ativos" (handoff §12): itens com hover-lift, pill de
 * severidade e deep-link p/ a página de Insights (grava o ID em
 * `localStorage['senno-insight-focus']` antes de navegar — a página abre a aba
 * do status, expande o card e aplica o flash; Insights-handoff §13).
 */
export function InsightsCard({ insights }: { insights: InsightItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const more = insights.length - VISIBLE

  function goInsight(id: string) {
    try {
      localStorage.setItem('senno-insight-focus', id)
    } catch {
      // localStorage indisponível não impede a navegação
    }
    router.push('/insights')
  }

  return (
    <div className="relative flex h-full flex-col rounded-[13px] border border-border bg-card px-[18px] py-4 shadow-card transition-colors hover:border-primary/50">
      {open && (
        <SeeAllOverlay
          title="Insights ativos"
          countPill={`${insights.length} ativos`}
          onClose={() => setOpen(false)}
          padding="px-[18px] py-4"
        >
          <div className="-mx-1 flex flex-col px-1">
            {insights.map((i) => (
              <InsightLine key={i.id} insight={i} truncate={false} onOpen={goInsight} />
            ))}
          </div>
        </SeeAllOverlay>
      )}

      <div className="mb-1.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-[9px]">
          <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
            Insights ativos
          </h2>
          {insights.length > 0 && <CountPill>{`${insights.length} ativos`}</CountPill>}
        </div>
        {more > 0 && <SeeAllButton label="Ver todos" more={more} onClick={() => setOpen(true)} />}
      </div>

      {insights.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Lightbulb
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Nenhum insight aberto</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            Os insights gerados para a clínica aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {insights.slice(0, VISIBLE).map((i) => (
            <InsightLine key={i.id} insight={i} truncate onOpen={goInsight} />
          ))}
        </div>
      )}
    </div>
  )
}
