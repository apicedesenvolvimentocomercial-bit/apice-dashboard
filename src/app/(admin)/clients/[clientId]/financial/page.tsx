import type { Metadata } from 'next'

import {
  getFinancialOverview,
  getRevenues,
  getCosts,
  getProceduresWithStats,
  getProceduresForSelect,
  getPatientsForSelect,
} from '@/server/queries/financial-queries'
import { FinancialTabs } from '@/modules/financial/financial-tabs'

export const metadata: Metadata = { title: 'Financeiro' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientFinancialPage({ params }: Props) {
  const { clientId } = (await params) as { clientId: string }

  const [{ summary, chartData }, revenues, costs, procedures, proceduresForSelect, patients] =
    await Promise.all([
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
      summary={summary}
      chartData={chartData}
      revenues={revenues}
      costs={costs}
      procedures={procedures}
      proceduresForSelect={proceduresForSelect}
      patients={patients}
    />
  )
}
