import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { gateClinicTab } from '@/server/auth/clinic-tabs'
import {
  getClinicCrmSchedule,
  getClinicPipelines,
  getClinicProceduresForScheduling,
} from '@/domains/clinic/crm/lead-queries'
import { PipelineTabs } from '@/modules/crm/pipeline-tabs'

export const metadata: Metadata = { title: 'Funil' }

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

  const [pipelines, procedures, schedule] = await Promise.all([
    getClinicPipelines(),
    getClinicProceduresForScheduling(),
    getClinicCrmSchedule(),
  ])

  return (
    // Redesign (Funil-handoff §1): o h1 "Funil" vive no TOPBAR; o corpo é só
    // busca ampla → abas de funil → board. Ocupa a altura total do <main>
    // (h-full) como coluna flex: a board (min-h-0) toma o resto e rola
    // sozinha na horizontal — a página não cresce verticalmente.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PipelineTabs
        clientId={clientId}
        pipelines={pipelines}
        procedures={procedures}
        schedule={schedule}
      />
    </div>
  )
}
