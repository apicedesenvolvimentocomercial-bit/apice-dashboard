import type { Metadata } from 'next'

import { auth } from '@/server/auth'
import { ProceduresTab } from '@/modules/financial/procedures-tab'
import { getClinicProceduresWithStats } from '@/domains/clinic/procedures/procedure-queries'

export const metadata: Metadata = { title: 'Procedimentos' }

export default async function ClientProceduresPage() {
  const session = await auth()
  const clientId = session?.user?.clientId

  if (!clientId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Clínica não encontrada na sessão.
      </div>
    )
  }

  const procedures = await getClinicProceduresWithStats()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Procedimentos</h1>
        <p className="text-muted-foreground">
          Cadastre, edite e acompanhe a margem dos procedimentos da clínica.
        </p>
      </div>
      <ProceduresTab procedures={procedures} clientId={clientId} />
    </div>
  )
}
