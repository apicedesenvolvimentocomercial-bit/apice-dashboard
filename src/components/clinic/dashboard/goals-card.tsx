'use client'

import { Calendar, Target } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { metricLabel, isPercentMetric } from '@/shared/goal-labels'

import { compactK } from './format'
import { CountPill, SeeAllButton, SeeAllOverlay } from './see-all-overlay'

export type GoalRow = {
  id: string
  metric: string
  targetValue: number
  currentValue: number
  progressPct: number
  endDate: Date
}

const VISIBLE = 4

/** "R$ 184k / 235k" · "28% / 50%" · "32 / 50" conforme a métrica. */
function goalDetail(g: GoalRow): string {
  if (g.metric === 'REVENUE' || g.metric === 'AVERAGE_TICKET') {
    return `R$ ${compactK(g.currentValue)} / ${compactK(g.targetValue)}`
  }
  if (isPercentMetric(g.metric)) {
    return `${Math.round(g.currentValue * 100)}% / ${Math.round(g.targetValue * 100)}%`
  }
  return `${g.currentValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / ${g.targetValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

function deadlineLabel(endDate: Date): string {
  const dias = Math.max(0, Math.round((new Date(endDate).getTime() - Date.now()) / 86_400_000))
  if (dias === 0) return 'termina hoje'
  return dias === 1 ? '1 dia restante' : `${dias} dias restantes`
}

function GoalLine({ goal }: { goal: GoalRow }) {
  const pct = Math.min(100, goal.progressPct)
  return (
    <div>
      <div className="mb-[3px] flex items-baseline justify-between gap-2.5">
        <span className="text-[13px] font-medium">{metricLabel(goal.metric)}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{goalDetail(goal)}</span>
      </div>
      <div className="mb-2 flex items-center gap-[5px] text-[11.5px] text-muted-foreground">
        <Calendar className="h-[13px] w-[13px] flex-none" aria-hidden="true" />
        <span className="tabular-nums">{deadlineLabel(goal.endDate)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {/* Threshold (handoff §7.2): ≥85% vira verde; senão dourado. */}
        <div
          className={`h-full rounded-full ${pct >= 85 ? 'bg-ok' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Card "Metas" (handoff §7): 4 visíveis + pill de contagem; excedente abre o
 * painel sobreposto "Ver todas". Empty state composto com ação.
 */
export function GoalsCard({ goals }: { goals: GoalRow[] }) {
  const [open, setOpen] = useState(false)
  const more = goals.length - VISIBLE

  return (
    <div className="relative flex h-full flex-col rounded-[13px] border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/50">
      {open && (
        <SeeAllOverlay
          title="Metas"
          countPill={`${goals.length} metas`}
          onClose={() => setOpen(false)}
        >
          {goals.map((g) => (
            <GoalLine key={g.id} goal={g} />
          ))}
        </SeeAllOverlay>
      )}

      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-[9px]">
          <h2 className="m-0 text-[length:clamp(16px,0.22vw+13.2px,17.5px)] font-semibold">
            Metas
          </h2>
          {goals.length > 0 && <CountPill>{`${goals.length} metas`}</CountPill>}
        </div>
        {more > 0 && <SeeAllButton label="Ver todas" more={more} onClick={() => setOpen(true)} />}
      </div>

      {goals.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <Target
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">Nenhuma meta ativa</p>
          <p className="-mt-1 text-xs text-muted-foreground">
            Defina metas para acompanhar o progresso aqui.
          </p>
          <Link
            href="/goals"
            className="mt-1 inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105"
          >
            Criar meta
          </Link>
        </div>
      ) : (
        <div className="mt-[18px] flex flex-col gap-[13px]">
          {goals.slice(0, VISIBLE).map((g) => (
            <GoalLine key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  )
}
