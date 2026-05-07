import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getClient } from '@/server/queries/client-queries'
import { getPipelineData } from '@/server/queries/lead-queries'
import { KanbanBoard } from '@/modules/crm/kanban-board'

type Props = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params
  const client = await getClient(clientId)
  return { title: `CRM — ${client?.name ?? 'Clínica'}` }
}

export default async function AdminClientCrmPage({ params }: Props) {
  const { clientId } = await params
  const [client, stages] = await Promise.all([getClient(clientId), getPipelineData(clientId)])

  if (!client) notFound()

  const totalLeads = stages.reduce((acc, s) => acc + s.leads.length, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CRM — {client.name}</h1>
        <p className="text-sm text-muted-foreground">{totalLeads} leads no funil</p>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Nenhuma etapa configurada. Crie a clínica novamente para gerar o funil padrão.
          </p>
        </div>
      ) : (
        <KanbanBoard stages={stages} clientId={clientId} />
      )}
    </div>
  )
}
