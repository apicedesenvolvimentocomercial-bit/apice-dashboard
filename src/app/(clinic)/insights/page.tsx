import type { Metadata } from 'next'

import { InsightsPage } from '@/modules/insights/insights-page'
import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import { getClinicInsightsFresh } from '@/domains/clinic/insights/insight-queries'

export const metadata: Metadata = { title: 'Insights' }

export default async function ClientInsightsPage() {
  await gateClinicTab('insights')
  const session = await auth()
  const clientId = session?.user?.clientId
  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const insights = await getClinicInsightsFresh()
  return <InsightsPage clientId={clientId} insights={insights} />
}
