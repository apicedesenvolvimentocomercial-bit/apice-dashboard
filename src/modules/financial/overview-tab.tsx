'use client'

import { ArrowDownRight, ArrowUpRight, Receipt, Users, Wallet } from 'lucide-react'
import { useState } from 'react'

import { RevenueCostChart } from '@/components/clinic/dashboard/revenue-cost-chart'
import { SeeAllButton, SeeAllOverlay } from '@/components/clinic/dashboard/see-all-overlay'
import { cn } from '@/lib/utils'

import { COST_TYPE_LABELS, formatCurrency } from './types'
import type { FinancialSummary, TopBuyer, TopCostCategory, TopProcedure, TopSeller } from './types'
import type { RevenueMonthlySeries } from '@/server/queries/revenue-series'

/** "12,4%" — uma casa, vírgula pt-BR. */
const pct1 = (v: number) => `${v.toFixed(1).replace('.', ',')}%`

// ---------------------------------------------------------------------------
// KPI card do Financeiro (handoff §5.1/§5.2) — difere do card do Dashboard:
// label 12.5px sem ícone, valor 25px que pode ser colorido (ok/destructive) e
// pill de delta com estado flat (cinza, sem seta) e "novo" (sem mês anterior).
// ---------------------------------------------------------------------------

type DeltaSpec = {
  cur: number
  prev: number
  /** false quando SUBIR é ruim (custos): cair vira pill verde com seta p/ baixo. */
  goodUp: boolean
}

function DeltaPill({ cur, prev, goodUp }: DeltaSpec) {
  // Sem base de comparação: mês anterior zerado → pill "novo" (handoff §5.2).
  if (prev <= 0) {
    if (cur <= 0) return null
    return (
      <span className="inline-flex items-center gap-[3px] rounded-full bg-ok-bg px-[7px] py-px text-xs font-semibold tabular-nums text-ok">
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        novo
      </span>
    )
  }
  const x = ((cur - prev) / prev) * 100
  const dir = x > 0.05 ? 'up' : x < -0.05 ? 'down' : 'flat'
  if (dir === 'flat') {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-[7px] py-px text-xs font-semibold tabular-nums text-muted-foreground">
        {`${x >= 0 ? '+' : '−'}${pct1(Math.abs(x))}`}
      </span>
    )
  }
  const good = dir === 'up' ? goodUp : !goodUp
  const Icon = dir === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[3px] rounded-full px-[7px] py-px text-xs font-semibold tabular-nums',
        good ? 'bg-ok-bg text-ok' : 'bg-destructive/[0.12] text-destructive'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {`${dir === 'up' ? '+' : '−'}${pct1(Math.abs(x))}`}
    </span>
  )
}

function FinKpiCard({
  label,
  value,
  valueClass,
  delta,
}: {
  label: string
  value: string
  valueClass?: string
  delta?: DeltaSpec | null
}) {
  return (
    <div className="rounded-[13px] border border-border bg-card px-[17px] py-4 shadow-card transition-colors hover:border-primary/50">
      <div className="text-[12.5px] font-semibold text-foreground">{label}</div>
      <div
        className={cn(
          'mt-[11px] whitespace-nowrap text-[25px] font-bold tabular-nums leading-none tracking-[-0.02em]',
          valueClass
        )}
      >
        {value}
      </div>
      {delta && (
        <div className="mt-[7px] flex items-center gap-[7px] text-xs">
          <DeltaPill {...delta} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card de ranking "Top" (handoff §5.4): rank chip + nome + meta + total + barra
// sob o nome; 5 visíveis, excedente no painel sobreposto "Ver todos".
// ---------------------------------------------------------------------------

const TOP_VIS = 5

type RankingItem = { key: string; name: string; meta: string; total: number }

function RankingLine({
  item,
  rank,
  max,
  solidFill,
  totalWidth,
}: {
  item: RankingItem
  rank: number
  max: number
  solidFill: boolean
  totalWidth: string
}) {
  const w = max > 0 ? Math.min((item.total / max) * 100, 100) : 0
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md bg-muted text-[11.5px] font-semibold tabular-nums text-muted-foreground">
          {rank}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={item.name}>
          {item.name}
        </span>
        <span className="flex-none text-xs tabular-nums text-muted-foreground">{item.meta}</span>
        <span
          className={cn(
            'flex-none text-right text-[13.5px] font-semibold tabular-nums',
            totalWidth
          )}
        >
          {formatCurrency(item.total)}
        </span>
      </div>
      <div className="ml-[34px] h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', solidFill ? 'bg-primary' : 'bg-primary/70')}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  )
}

function RankingCard({
  title,
  countLabel,
  seeAllLabel,
  items,
  solidFill = false,
  totalWidth = 'min-w-[96px]',
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDesc,
}: {
  title: string
  countLabel: string
  seeAllLabel: string
  items: RankingItem[]
  /** Fill sólido só em Top compradores (handoff §5.4); demais primary/0.7. */
  solidFill?: boolean
  totalWidth?: string
  emptyIcon: React.ElementType
  emptyTitle: string
  emptyDesc: string
}) {
  const [open, setOpen] = useState(false)
  const max = Math.max(...items.map((i) => i.total), 0)
  const more = items.length - TOP_VIS

  return (
    <div className="relative rounded-[13px] border border-border bg-card px-5 py-[18px] shadow-card transition-colors hover:border-primary/50">
      {open && (
        <SeeAllOverlay
          title={title}
          countPill={`${items.length} ${countLabel}`}
          onClose={() => setOpen(false)}
          padding="px-5 py-[18px]"
        >
          {items.map((item, i) => (
            <RankingLine
              key={item.key}
              item={item}
              rank={i + 1}
              max={max}
              solidFill={solidFill}
              totalWidth={totalWidth}
            />
          ))}
        </SeeAllOverlay>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        {more > 0 && <SeeAllButton label={seeAllLabel} more={more} onClick={() => setOpen(true)} />}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <EmptyIcon
            className="h-[34px] w-[34px] text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <p className="text-[13px] font-medium">{emptyTitle}</p>
          <p className="-mt-1 text-xs text-muted-foreground">{emptyDesc}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-[15px]">
          {items.slice(0, TOP_VIS).map((item, i) => (
            <RankingLine
              key={item.key}
              item={item}
              rank={i + 1}
              max={max}
              solidFill={solidFill}
              totalWidth={totalWidth}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba Visão Geral (handoff §5): KPIs resultado → KPIs caixa → gráfico → 4
// rankings em duas linhas 2-col.
// ---------------------------------------------------------------------------

type Props = {
  summary: FinancialSummary
  revenueSeries: RevenueMonthlySeries
  topProcedures: TopProcedure[]
  topCostCategories: TopCostCategory[]
  topBuyers: TopBuyer[]
  topSellers: TopSeller[]
}

const KPI_GRID = 'grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(228px,1fr))]'

export function OverviewTab({
  summary,
  revenueSeries,
  topProcedures,
  topCostCategories,
  topBuyers,
  topSellers,
}: Props) {
  const { current, previous, cash } = summary

  // Taxa de inadimplência = vencido ÷ total pendente em aberto.
  const defaultRate = cash.receivable > 0 ? (cash.overdue / cash.receivable) * 100 : 0

  const generatedMonths = revenueSeries.revenueByMonth.map((m) => ({
    label: m.month,
    revenue: m.revenue,
    costs: m.costs,
  }))
  // Caixa REALIZADO (passado + mês atual) — o gráfico do redesign termina no mês
  // corrente; a projeção de curto prazo vive no KPI "Saldo projetado (30 dias)".
  const receivedMonths = revenueSeries.receivedByMonth
    .slice(0, revenueSeries.receivedCenterIndex + 1)
    .map((m) => ({ label: m.month, revenue: m.revenue, costs: m.costs }))

  return (
    <div className="flex flex-col gap-4">
      {/* ---- KPIs "resultado" (competência — handoff §5.1) ---- */}
      <div className={KPI_GRID}>
        <FinKpiCard
          label="Receita do mês (competência)"
          value={formatCurrency(current.revenue)}
          delta={{ cur: current.revenue, prev: previous.revenue, goodUp: true }}
        />
        <FinKpiCard
          label="Custos do mês"
          value={formatCurrency(current.costs)}
          delta={{ cur: current.costs, prev: previous.costs, goodUp: false }}
        />
        <FinKpiCard
          label="Lucro líquido"
          value={formatCurrency(current.profit)}
          valueClass={current.profit >= 0 ? 'text-ok' : 'text-destructive'}
          delta={{ cur: current.profit, prev: previous.profit, goodUp: true }}
        />
        <FinKpiCard
          label="Margem líquida"
          value={pct1(current.margin)}
          valueClass={current.margin >= 0 ? 'text-ok' : 'text-destructive'}
        />
      </div>

      {/* ---- KPIs "caixa" (liquidez — handoff §5.2) ---- */}
      <div className={KPI_GRID}>
        <FinKpiCard
          label="Recebido no mês (caixa)"
          value={formatCurrency(cash.received)}
          valueClass="text-ok"
          delta={{ cur: cash.received, prev: cash.prevReceived, goodUp: true }}
        />
        <FinKpiCard label="Saldo projetado (30 dias)" value={formatCurrency(cash.projected30d)} />
        <FinKpiCard
          label="Vencido"
          value={formatCurrency(cash.overdue)}
          valueClass={cash.overdue > 0 ? 'text-destructive' : undefined}
        />
        <FinKpiCard
          label="Taxa de inadimplência"
          value={pct1(defaultRate)}
          valueClass={defaultRate > 0 ? 'text-destructive' : 'text-ok'}
        />
      </div>

      {/* ---- Gráfico Receita × Custos (handoff §5.3 — janela 12, plot 220) ---- */}
      <div className="min-w-0">
        <RevenueCostChart
          generated={generatedMonths}
          received={receivedMonths}
          showGenerated
          showReceived
          windowCount={12}
          plotHeight={220}
        />
      </div>

      {/* ---- Rankings "Top" (handoff §5.4) ---- */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <RankingCard
          title="Top procedimentos do mês"
          countLabel="procedimentos"
          seeAllLabel="Ver todos"
          items={topProcedures.map((p) => ({
            key: p.procedureId ?? p.name,
            name: p.name,
            meta: `${p.count}×`,
            total: p.total,
          }))}
          emptyIcon={Receipt}
          emptyTitle="Sem receitas no mês"
          emptyDesc="Lançamentos com procedimento aparecem aqui ranqueados."
        />
        <RankingCard
          title="Top categorias de custo do mês"
          countLabel="categorias"
          seeAllLabel="Ver todas"
          items={topCostCategories.map((c, i) => ({
            key: `${c.type}-${c.category ?? i}`,
            name: c.label,
            meta: COST_TYPE_LABELS[c.type] ?? c.type,
            total: c.total,
          }))}
          emptyIcon={Wallet}
          emptyTitle="Sem custos no mês"
          emptyDesc="Custos lançados aparecem aqui agrupados por categoria."
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <RankingCard
          title="Top compradores"
          countLabel="compradores"
          seeAllLabel="Ver todos"
          solidFill
          items={topBuyers.map((b) => ({
            key: b.patientId,
            name: b.name,
            meta: `${b.count} atend.`,
            total: b.total,
          }))}
          emptyIcon={Users}
          emptyTitle="Sem compras registradas"
          emptyDesc="Receitas ligadas a um paciente montam este ranking."
        />
        <RankingCard
          title="Top vendedores"
          countLabel="vendedores"
          seeAllLabel="Ver todos"
          totalWidth="min-w-[104px]"
          items={topSellers.map((s) => ({
            key: s.userId,
            name: s.name,
            meta: `${s.count} vendas`,
            total: s.total,
          }))}
          emptyIcon={Users}
          emptyTitle="Sem vendas registradas"
          emptyDesc="Receitas lançadas por um usuário montam este ranking."
        />
      </div>
    </div>
  )
}
