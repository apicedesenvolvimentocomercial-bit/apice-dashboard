import type { Metadata } from 'next'

import { PipelineBoard } from '@/modules/pipeline/pipeline-board'
import type { PipelineDealView } from '@/modules/pipeline/types'
import { gateAgencyTab } from '@/server/auth/agency-tabs'
import {
  findClientsWithoutDeal,
  listPipelineDeals,
} from '@/server/repositories/pipeline-deal-repository'
import { getTenantContext } from '@/server/tenant/context'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function PipelinePage() {
  await gateAgencyTab('crm')

  const ctx = await getTenantContext()
  const [rawDeals, availableClients] = await Promise.all([
    listPipelineDeals(ctx),
    findClientsWithoutDeal(ctx),
  ])

  const deals: PipelineDealView[] = rawDeals.map((d) => ({
    id: d.id,
    stage: d.stage,
    position: d.position,
    value: d.value != null ? Number(d.value) : null,
    probability: d.probability,
    expectedCloseAt: d.expectedCloseAt,
    wonAt: d.wonAt,
    lostAt: d.lostAt,
    lostReason: d.lostReason,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    client: d.client,
  }))

  return (
    <div className="space-y-6">
      <PipelineBoard deals={deals} availableClients={availableClients} />
    </div>
  )
}
