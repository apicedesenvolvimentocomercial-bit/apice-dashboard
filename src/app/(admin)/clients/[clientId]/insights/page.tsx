import type { Metadata } from 'next'

import { InsightsPage } from '@/modules/insights/insights-page'
import { listInsightsFresh } from '@/server/queries/insight-queries'

export const metadata: Metadata = { title: 'Insights' }

type Props = { params: Promise<{ clientId: string }> }

export default async function AdminClinicInsightsPage({ params }: Props) {
  const { clientId } = await params
  const insights = await listInsightsFresh(clientId)
  return <InsightsPage clientId={clientId} insights={insights} />
}
