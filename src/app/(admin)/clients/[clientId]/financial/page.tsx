import type { Metadata } from 'next'

import {
  getCosts,
  getFinancialOverview,
  getPatientsForSelect,
  getProceduresForSelect,
  getProceduresWithStats,
  getRevenues,
} from '@/server/queries/financial-queries'
import { FinancialTabs } from '@/modules/financial/financial-tabs'

export const metadata: Metadata = { title: 'Financeiro' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientFinancialPage({ params }: Props) {
  const { clientId } = await params

  const [overview, revenues, costs, procedures, proceduresForSelect, patients] = await Promise.all([
    getFinancialOverview(clientId),
    getRevenues(clientId),
    getCosts(clientId),
    getProceduresWithStats(clientId),
    getProceduresForSelect(clientId),
    getPatientsForSelect(clientId),
  ])

  return (
    <FinancialTabs
      clientId={clientId}
      summary={overview.summary}
      chartData={overview.chartData}
      topProcedures={overview.topProcedures}
      topCostCategories={overview.topCostCategories}
      revenues={revenues}
      costs={costs}
      procedures={procedures}
      proceduresForSelect={proceduresForSelect}
      patients={patients}
    />
  )
}
