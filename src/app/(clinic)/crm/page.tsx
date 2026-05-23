import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { getClinicPipeline } from '@/domains/clinic/crm/lead-queries'
import { KanbanBoard } from '@/modules/crm/kanban-board'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function ClientCrmPage() {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const stages = await getClinicPipeline()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {stages.reduce((acc, s) => acc + s.leads.length, 0)} leads no funil
          </p>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Nenhuma etapa configurada no funil.</p>
        </div>
      ) : (
        <KanbanBoard stages={stages} clientId={clientId} />
      )}
    </div>
  )
}
