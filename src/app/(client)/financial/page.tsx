import type { Metadata } from 'next'

import { auth } from '@/server/auth'
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

export default async function ClientFinancialPage() {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

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
