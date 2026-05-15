import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { PeriodFilter } from '@/components/dashboard/period-filter'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { ClinicDashboard } from '@/modules/dashboard/clinic-dashboard'
import { getClinicDashboard } from '@/server/queries/dashboard-queries'
import { getClient } from '@/server/queries/client-queries'
import { parsePeriodParam } from '@/server/services/kpi'
import { PdfDownloadButton } from '@/modules/clients/pdf-download-button'

type DashboardSearchParams = { period?: string; from?: string; to?: string }
type Props = {
  params: Promise<{ clientId: string }>
  searchParams: Promise<DashboardSearchParams>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clientId } = await params
  const client = await getClient(clientId)
  return { title: client?.name ?? 'Clínica' }
}

export default async function ClientOverviewPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const sp = await searchParams
  const period = parsePeriodParam(sp.period)
  const from = typeof sp.from === 'string' ? sp.from : undefined
  const to = typeof sp.to === 'string' ? sp.to : undefined

  const client = await getClient(clientId)
  if (!client) notFound()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
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
          <p className="text-muted-foreground">
            {[client.city, client.state].filter(Boolean).join(', ')}
            {client.contractStart && ` · desde ${formatDate(client.contractStart)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PdfDownloadButton clientId={clientId} from={from} to={to} />
          <PeriodFilter />
        </div>
      </div>

      <Suspense
        key={`${clientId}-${period}-${from ?? ''}-${to ?? ''}`}
        fallback={<ClinicSkeleton />}
      >
        <ClinicContent clientId={clientId} period={period} from={from} to={to} />
      </Suspense>
    </div>
  )
}

async function ClinicContent({
  clientId,
  period,
  from,
  to,
}: {
  clientId: string
  period: ReturnType<typeof parsePeriodParam>
  from?: string
  to?: string
}) {
  const data = await getClinicDashboard(clientId, period, from, to)
  return <ClinicDashboard data={data} />
}

function ClinicSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}
