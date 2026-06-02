import type { Metadata } from 'next'

import {
  getCosts,
  getFinancialOverview,
  getPatientsForSelect,
  getProceduresForSelect,
  getRevenues,
} from '@/server/queries/financial-queries'
import { getRevenueMonthlySeries } from '@/server/queries/revenue-series'
import { assertCan } from '@/server/auth/assert-can'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { FinancialTabs } from '@/modules/financial/financial-tabs'

export const metadata: Metadata = { title: 'Financeiro' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClientFinancialPage({ params }: Props) {
  const { clientId } = await params

  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'financial', 'read')

  const [overview, revenueSeries, revenues, costs, proceduresForSelect, patients] =
    await Promise.all([
      getFinancialOverview(clientId),
      getRevenueMonthlySeries(ctx, clientId),
      getRevenues(clientId),
      getCosts(clientId),
      getProceduresForSelect(clientId),
      getPatientsForSelect(clientId),
    ])

  return (
    <FinancialTabs
      clientId={clientId}
      summary={overview.summary}
      revenueSeries={revenueSeries}
      topProcedures={overview.topProcedures}
      topCostCategories={overview.topCostCategories}
      revenues={revenues}
      costs={costs}
      proceduresForSelect={proceduresForSelect}
      patients={patients}
    />
  )
}
