import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getClient } from '@/server/queries/client-queries'
import { getPipelineData } from '@/server/queries/lead-queries'
import { PipelineTabs } from '@/modules/crm/pipeline-tabs'

type Props = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params
  const client = await getClient(clientId)
  return { title: `Pipeline — ${client?.name ?? 'Clínica'}` }
}

export default async function AdminClientCrmPage({ params }: Props) {
  const { clientId } = await params
  const [client, newStages, existingStages] = await Promise.all([
    getClient(clientId),
    getPipelineData(clientId, 'NEW'),
    getPipelineData(clientId, 'EXISTING'),
  ])

  if (!client) notFound()

  const totalNew = newStages.reduce((acc, s) => acc + s.leads.length, 0)
  const totalExisting = existingStages.reduce((acc, s) => acc + s.leads.length, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline — {client.name}</h1>
        <p className="text-sm text-muted-foreground">
          {totalNew} clientes novos · {totalExisting} cadastrados no funil
        </p>
      </div>

      <PipelineTabs clientId={clientId} newStages={newStages} existingStages={existingStages} />
    </div>
  )
}
