import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import {
  getClinicPipelines,
  getClinicProceduresForScheduling,
} from '@/domains/clinic/crm/lead-queries'
import { PipelineTabs } from '@/modules/crm/pipeline-tabs'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function ClientCrmPage() {
  await gateClinicTab('crm')
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const [pipelines, procedures] = await Promise.all([
    getClinicPipelines(),
    getClinicProceduresForScheduling(),
  ])
  const totalLeads = pipelines.reduce(
    (acc, p) => acc + p.stages.reduce((s, st) => s + st.leads.length, 0),
    0
  )

  return (
    // Ocupa a altura total do <main> (h-full) e vira coluna flex: o cabeçalho
    // tem altura natural e as tabs/board tomam o resto (min-h-0 deixa o filho
    // encolher). Assim a board rola só na horizontal e a página não cresce
    // verticalmente — a scrollbar horizontal fica sempre no rodapé visível.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          {pipelines.length} {pipelines.length === 1 ? 'funil' : 'funis'} · {totalLeads} cards
        </p>
      </div>

      <PipelineTabs clientId={clientId} pipelines={pipelines} procedures={procedures} />
    </div>
  )
}
