import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { getClient } from '@/server/queries/client-queries'
import { ClientSubNav } from '@/modules/clients/client-sub-nav'

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClient(clientId)

  if (!client) notFound()

  return (
    <div className="space-y-0">
      <div className="border-b bg-background pb-0">
        <div className="flex items-center gap-2 px-0 pb-3">
          <Link
            href="/clients"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Clínicas
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{client.name}</span>
        </div>

        <ClientSubNav clientId={clientId} />
      </div>

      <div className="pt-6">{children}</div>
    </div>
  )
}
