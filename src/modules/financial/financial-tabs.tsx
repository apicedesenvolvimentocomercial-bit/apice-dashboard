'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { OverviewTab } from './overview-tab'
import { DreTab } from './dre-tab'
import { ReceivablesTab } from './receivables-tab'
import { AssetsTab } from './assets-tab'
import { RevenuesTab } from './revenues-tab'
import { CostsTab } from './costs-tab'
import type {
  CostRow,
  FinancialSummary,
  ProcedureForSelect,
  RevenueRow,
  TopBuyer,
  TopCostCategory,
  TopProcedure,
  TopSeller,
} from './types'
import type { RevenueMonthlySeries } from '@/server/queries/revenue-series'

type Patient = { id: string; name: string }

type TabKey = 'visao' | 'dre' | 'receitas' | 'contas' | 'custos' | 'ativos'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'visao', label: 'Visão Geral' },
  { key: 'dre', label: 'DRE' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'contas', label: 'Contas a Receber' },
  { key: 'custos', label: 'Custos' },
  { key: 'ativos', label: 'Ativos' },
]

type Props = {
  clientId: string
  summary: FinancialSummary
  revenueSeries: RevenueMonthlySeries
  topProcedures: TopProcedure[]
  topCostCategories: TopCostCategory[]
  topBuyers: TopBuyer[]
  topSellers: TopSeller[]
  revenues: RevenueRow[]
  costs: CostRow[]
  proceduresForSelect: ProcedureForSelect[]
  patients: Patient[]
}

/**
 * Tela Financeiro — redesign Senno (prompt/Senno Redesign/Financeiro): 6 abas
 * em barra de underline dourado MEDIDO (handoff §4); cada aba é um painel
 * próprio (§5–§10). O chrome (título "Financeiro", busca, tema, sino) vive no
 * topbar/layout — aqui só o corpo. Botões de ação ficam DENTRO do conteúdo de
 * cada aba, alinhados à barra (regra do design system).
 */
export function FinancialTabs({
  clientId,
  summary,
  revenueSeries,
  topProcedures,
  topCostCategories,
  topBuyers,
  topSellers,
  revenues,
  costs,
  proceduresForSelect,
  patients,
}: Props) {
  const [tab, setTab] = useState<TabKey>('visao')

  // ---- Indicador da aba ativa (underline 2px MEDIDO — handoff §4) ----
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ left: 0, width: 0, ready: false })
  const measure = useCallback(() => {
    const active = tabBarRef.current?.querySelector<HTMLElement>('[data-tab-active="1"]')
    if (!active) return
    setInd({ left: active.offsetLeft, width: active.offsetWidth, ready: true })
  }, [])
  useEffect(() => {
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, tab])

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0 self-start overflow-x-auto">
        <div
          ref={tabBarRef}
          className="relative flex w-max items-center gap-1 border-b border-border"
          role="tablist"
          aria-label="Seções do financeiro"
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
          {TABS.map((t) => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-tab-active={isActive ? '1' : undefined}
                onClick={() => setTab(t.key)}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-[9px] text-[13.5px] font-semibold transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'visao' && (
        <OverviewTab
          summary={summary}
          revenueSeries={revenueSeries}
          topProcedures={topProcedures}
          topCostCategories={topCostCategories}
          topBuyers={topBuyers}
          topSellers={topSellers}
        />
      )}
      {tab === 'dre' && <DreTab clientId={clientId} />}
      {tab === 'receitas' && (
        <RevenuesTab
          revenues={revenues}
          clientId={clientId}
          patients={patients}
          procedures={proceduresForSelect}
        />
      )}
      {tab === 'contas' && <ReceivablesTab clientId={clientId} />}
      {tab === 'custos' && <CostsTab costs={costs} clientId={clientId} />}
      {tab === 'ativos' && <AssetsTab clientId={clientId} />}
    </div>
  )
}
