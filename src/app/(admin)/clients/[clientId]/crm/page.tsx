import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getClient } from '@/server/queries/client-queries'
import {
  getClinicPipelinesWithStages,
  getProceduresForScheduling,
} from '@/server/queries/lead-queries'
import { PipelineTabs } from '@/modules/crm/pipeline-tabs'

type Props = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params
  const client = await getClient(clientId)
  return { title: `Pipeline — ${client?.name ?? 'Clínica'}` }
}

export default async function AdminClientCrmPage({ params }: Props) {
  const { clientId } = await params
  const [client, pipelines, procedures] = await Promise.all([
    getClient(clientId),
    getClinicPipelinesWithStages(clientId),
    getProceduresForScheduling(clientId),
  ])

  if (!client) notFound()

  const totalLeads = pipelines.reduce(
    (acc, p) => acc + p.stages.reduce((s, st) => s + st.leads.length, 0),
    0
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline — {client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {pipelines.length} {pipelines.length === 1 ? 'funil' : 'funis'} · {totalLeads} cards
        </p>
      </div>

      <PipelineTabs clientId={clientId} pipelines={pipelines} procedures={procedures} />
    </div>
  )
}
