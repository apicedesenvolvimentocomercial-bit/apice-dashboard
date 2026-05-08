'use client'

import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverviewTab } from './overview-tab'
import { RevenuesTab } from './revenues-tab'
import { CostsTab } from './costs-tab'
import { ProceduresTab } from './procedures-tab'
import type {
  FinancialSummary,
  ChartMonth,
  RevenueRow,
  CostRow,
  ProcedureWithStats,
  ProcedureForSelect,
} from './types'

type Patient = { id: string; name: string }

type Props = {
  clientId: string
  summary: FinancialSummary
  chartData: ChartMonth[]
  revenues: RevenueRow[]
  costs: CostRow[]
  procedures: ProcedureWithStats[]
  proceduresForSelect: ProcedureForSelect[]
  patients: Patient[]
}

export function FinancialTabs({
  clientId,
  summary,
  chartData,
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
        <p className="text-muted-foreground">Receitas, custos e procedimentos</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="revenues">Receitas</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="procedures">Procedimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab summary={summary} chartData={chartData} />
        </TabsContent>

        <TabsContent value="revenues" className="mt-6 space-y-4">
          <RevenuesTab
            revenues={revenues}
            clientId={clientId}
            patients={patients}
            procedures={proceduresForSelect}
          />
        </TabsContent>

        <TabsContent value="costs" className="mt-6 space-y-4">
          <CostsTab costs={costs} clientId={clientId} />
        </TabsContent>

        <TabsContent value="procedures" className="mt-6 space-y-4">
          <ProceduresTab procedures={procedures} clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
