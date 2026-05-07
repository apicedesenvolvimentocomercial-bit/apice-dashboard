import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getClient } from '@/server/queries/client-queries'
import { formatDate } from '@/lib/utils'

type Props = { params: Promise<{ clientId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params
  const client = await getClient(clientId)
  return { title: client?.name ?? 'Clínica' }
}

export default async function ClientOverviewPage({ params }: Props) {
  const { clientId } = await params
  const client = await getClient(clientId)

  if (!client) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-muted-foreground">
            {[client.city, client.state].filter(Boolean).join(', ')}
            {client.contractStart && ` · desde ${formatDate(client.contractStart)}`}
          </p>
        </div>
        <Badge
          variant={
            client.status === 'ACTIVE'
              ? 'success'
              : client.status === 'ONBOARDING'
                ? 'info'
                : client.status === 'CHURNED'
                  ? 'critical'
                  : 'secondary'
          }
        >
          {client.status}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{client._count.leads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{client._count.users}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Procedimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{client._count.procedures}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Health Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{client.healthScore ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          Dashboards completos disponíveis na Fase 6 (KPIs e gráficos).
        </p>
      </div>
    </div>
  )
}
