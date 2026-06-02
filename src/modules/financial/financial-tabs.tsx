'use client'

import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverviewTab } from './overview-tab'
import { DreTab } from './dre-tab'
import { ReceivablesTab } from './receivables-tab'
import { AssetsTab } from './assets-tab'
import { RevenuesTab } from './revenues-tab'
import { CostsTab } from './costs-tab'
import { ProceduresTab } from './procedures-tab'
import { ReportsTab } from './reports-tab'
import type {
  CostRow,
  FinancialSummary,
  ProcedureForSelect,
  ProcedureWithStats,
  RevenueRow,
  TopCostCategory,
  TopProcedure,
} from './types'
import type { RevenueMonthlySeries } from '@/server/queries/revenue-series'

type Patient = { id: string; name: string }

type Props = {
  clientId: string
  summary: FinancialSummary
  revenueSeries: RevenueMonthlySeries
  topProcedures: TopProcedure[]
  topCostCategories: TopCostCategory[]
  revenues: RevenueRow[]
  costs: CostRow[]
  procedures: ProcedureWithStats[]
  proceduresForSelect: ProcedureForSelect[]
  patients: Patient[]
}

export function FinancialTabs({
  clientId,
  summary,
  revenueSeries,
  topProcedures,
  topCostCategories,
  revenues,
  costs,
  procedures,
  proceduresForSelect,
  patients,
}: Props) {
  const [tab, setTab] = useState('overview')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">Receitas, custos, procedimentos e DRE</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="dre">DRE</TabsTrigger>
          <TabsTrigger value="revenues">Receitas</TabsTrigger>
          <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="assets">Ativos</TabsTrigger>
          <TabsTrigger value="procedures">Procedimentos</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            summary={summary}
            revenueSeries={revenueSeries}
            topProcedures={topProcedures}
            topCostCategories={topCostCategories}
          />
        </TabsContent>

        <TabsContent value="dre" className="mt-6">
          <DreTab clientId={clientId} />
        </TabsContent>

        <TabsContent value="revenues" className="mt-6 space-y-4">
          <RevenuesTab
            revenues={revenues}
            clientId={clientId}
            patients={patients}
            procedures={proceduresForSelect}
          />
        </TabsContent>

        <TabsContent value="receivables" className="mt-6 space-y-4">
          <ReceivablesTab clientId={clientId} />
        </TabsContent>

        <TabsContent value="assets" className="mt-6 space-y-4">
          <AssetsTab clientId={clientId} />
        </TabsContent>

        <TabsContent value="costs" className="mt-6 space-y-4">
          <CostsTab costs={costs} clientId={clientId} />
        </TabsContent>

        <TabsContent value="procedures" className="mt-6 space-y-4">
          <ProceduresTab procedures={procedures} clientId={clientId} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ReportsTab clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
