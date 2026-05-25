import type { Metadata } from 'next'

import { ClientsList } from '@/modules/clients/clients-list'
import { gateAgencyTab } from '@/server/auth/agency-tabs'
import { getClients } from '@/server/queries/client-queries'

export const metadata: Metadata = { title: 'Clínicas' }

export default async function ClientsPage() {
  await gateAgencyTab('clients')
  const clients = await getClients()

  return (
    <div className="space-y-6">
      <ClientsList clients={clients} />
    </div>
  )
}
