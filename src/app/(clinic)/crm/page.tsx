import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { getClinicPipeline } from '@/domains/clinic/crm/lead-queries'
import { PipelineTabs } from '@/modules/crm/pipeline-tabs'

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

  const [newStages, existingStages] = await Promise.all([
    getClinicPipeline('NEW'),
    getClinicPipeline('EXISTING'),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          {newStages.reduce((acc, s) => acc + s.leads.length, 0)} clientes novos ·{' '}
          {existingStages.reduce((acc, s) => acc + s.leads.length, 0)} cadastrados no funil
        </p>
      </div>

      <PipelineTabs clientId={clientId} newStages={newStages} existingStages={existingStages} />
    </div>
  )
}
