import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import { getClinicFinancialPage } from '@/domains/clinic/financial/financial-queries'
import { FinancialTabs } from '@/modules/financial/financial-tabs'

export const metadata: Metadata = { title: 'Financeiro' }

export default async function ClientFinancialPage() {
  await gateClinicTab('financial')
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const { overview, revenueSeries, revenues, costs, proceduresForSelect, patients } =
    await getClinicFinancialPage()

  return (
    <FinancialTabs
      clientId={clientId}
      summary={overview.summary}
      revenueSeries={revenueSeries}
      topProcedures={overview.topProcedures}
      topCostCategories={overview.topCostCategories}
      topBuyers={overview.topBuyers}
      topSellers={overview.topSellers}
      revenues={revenues}
      costs={costs}
      proceduresForSelect={proceduresForSelect}
      patients={patients}
    />
  )
}
